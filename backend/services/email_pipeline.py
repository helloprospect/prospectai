"""
Email pipeline: Sourcing → Research → Scoring → Personalization → Sending
Runs per-workspace. Called by APScheduler every 4 hours and on-demand.
"""
import asyncio
import json
import logging
import random
from uuid import UUID

import db
from services.searchleads import SearchLeadsClient
from services import claude_client
from services.instantly_sync import InstantlyClient

logger = logging.getLogger(__name__)


async def run_pipeline(workspace_id: UUID):
    logger.info(f"[pipeline] Starting for workspace {workspace_id}")
    async with db.get_conn() as conn:
        workspace = await conn.fetchrow("SELECT * FROM workspaces WHERE id = $1", workspace_id)

    if not workspace or workspace["status"] != "active":
        logger.info(f"[pipeline] Workspace {workspace_id} not active, skipping")
        return

    icp = workspace["icp_config"] or {}
    daily_target = workspace["daily_lead_target"] or 50

    # Run each stage
    new_leads = await source_leads(workspace_id, icp, daily_target)
    logger.info(f"[pipeline] Sourced {new_leads} new leads")

    researched = await research_leads(workspace_id)
    logger.info(f"[pipeline] Researched {researched} leads")

    scored = await score_leads(workspace_id)
    logger.info(f"[pipeline] Scored {scored} leads")

    personalized = await personalize_leads(workspace_id)
    logger.info(f"[pipeline] Personalized {personalized} leads")

    sent = await send_leads(workspace_id)
    logger.info(f"[pipeline] Sent {sent} leads to Instantly")


# ============================================================
# STAGE 1: SOURCING
# ============================================================

async def source_leads(workspace_id: UUID, icp: dict, limit: int) -> int:
    client = SearchLeadsClient()

    # Fetch leads from SearchLeads
    raw_leads = await client.search_people(
        industries=icp.get("industries"),
        titles=icp.get("titles"),
        company_sizes=icp.get("company_sizes"),
        geographies=icp.get("geographies"),
        limit=limit,
    )

    if not raw_leads:
        return 0

    # Apply exclusion filters
    exclusions = [e.lower() for e in icp.get("exclusions", [])]
    if exclusions:
        raw_leads = [
            lead for lead in raw_leads
            if not any(excl in (lead.get("title") or "").lower() for excl in exclusions)
        ]

    inserted = 0
    async with db.get_conn() as conn:
        for lead in raw_leads:
            try:
                result = await conn.execute(
                    """
                    INSERT INTO leads
                        (workspace_id, email, first_name, last_name, company, title,
                         linkedin_url, website, industry, company_size, location,
                         source, source_raw)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                    ON CONFLICT (workspace_id, email) DO NOTHING
                    """,
                    workspace_id,
                    lead["email"],
                    lead.get("first_name", ""),
                    lead.get("last_name", ""),
                    lead.get("company", ""),
                    lead.get("title", ""),
                    lead.get("linkedin_url", ""),
                    lead.get("website", ""),
                    lead.get("industry", ""),
                    lead.get("company_size", ""),
                    lead.get("location", ""),
                    "searchleads",
                    json.dumps(lead.get("source_raw", {})),
                )
                if result == "INSERT 0 1":
                    inserted += 1
            except Exception as e:
                logger.warning(f"[sourcing] Failed to insert lead {lead.get('email')}: {e}")

    return inserted


# ============================================================
# STAGE 2: RESEARCH
# ============================================================

async def research_leads(workspace_id: UUID, batch_size: int = 50, concurrency: int = 5) -> int:
    async with db.get_conn() as conn:
        leads = await conn.fetch(
            """
            SELECT * FROM leads
            WHERE workspace_id = $1 AND status = 'raw'
            ORDER BY created_at ASC
            LIMIT $2
            """,
            workspace_id, batch_size,
        )
        prompt_template = await conn.fetchrow(
            """
            SELECT content FROM prompt_templates
            WHERE workspace_id = $1 AND template_type = 'research' AND is_active = true
            """,
            workspace_id,
        )
        workspace = await conn.fetchrow("SELECT * FROM workspaces WHERE id = $1", workspace_id)

    if not leads or not prompt_template:
        return 0

    template = prompt_template["content"]
    ws_dict = dict(workspace) if workspace else {}
    semaphore = asyncio.Semaphore(concurrency)
    tasks = [
        _research_one_lead(workspace_id, dict(lead), template, ws_dict, semaphore)
        for lead in leads
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return sum(1 for r in results if r is True)


async def _research_one_lead(workspace_id: UUID, lead: dict, template: str, workspace: dict, sem: asyncio.Semaphore) -> bool:
    async with sem:
        try:
            research, tokens = await claude_client.research_lead(template, lead, workspace=workspace)
            async with db.get_tx() as conn:
                await conn.execute(
                    """
                    INSERT INTO lead_research
                        (workspace_id, lead_id, company_summary, recent_news, tech_stack,
                         pain_points, buying_signals, decision_maker_bio, linkedin_activity,
                         custom_insights, tokens_used)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                    """,
                    workspace_id,
                    lead["id"],
                    research.get("company_summary", ""),
                    research.get("recent_news", ""),
                    research.get("tech_stack", []),
                    research.get("pain_points", []),
                    research.get("buying_signals", []),
                    research.get("decision_maker_bio", ""),
                    research.get("linkedin_activity", ""),
                    json.dumps(research.get("custom_insights", {})),
                    tokens,
                )
                await conn.execute(
                    "UPDATE leads SET status = 'researched' WHERE id = $1", lead["id"]
                )
            return True
        except Exception as e:
            logger.error(f"[research] Lead {lead['id']} failed: {e}")
            return False


# ============================================================
# STAGE 3: SCORING
# ============================================================

async def score_leads(workspace_id: UUID, batch_size: int = 50, concurrency: int = 10) -> int:
    async with db.get_conn() as conn:
        leads = await conn.fetch(
            """
            SELECT l.*, lr.company_summary, lr.recent_news, lr.tech_stack,
                   lr.pain_points, lr.buying_signals, lr.decision_maker_bio
            FROM leads l
            JOIN lead_research lr ON lr.lead_id = l.id
            WHERE l.workspace_id = $1 AND l.status = 'researched'
            ORDER BY l.created_at ASC
            LIMIT $2
            """,
            workspace_id, batch_size,
        )
        prompt_row = await conn.fetchrow(
            "SELECT id, content FROM prompt_templates WHERE workspace_id = $1 AND template_type = 'scoring' AND is_active = true",
            workspace_id,
        )
        weights_row = await conn.fetchrow(
            "SELECT id, weights, min_score_threshold FROM scoring_weights WHERE workspace_id = $1 AND is_active = true",
            workspace_id,
        )
        workspace = await conn.fetchrow(
            "SELECT * FROM workspaces WHERE id = $1", workspace_id
        )

    if not leads or not prompt_row or not weights_row:
        return 0

    ws_dict = dict(workspace) if workspace else {}
    icp = ws_dict.get("icp_config") or {}
    weights = weights_row["weights"] or {}
    threshold = ws_dict.get("min_score_threshold") or weights_row["min_score_threshold"] or 50

    semaphore = asyncio.Semaphore(concurrency)
    tasks = [
        _score_one_lead(workspace_id, dict(lead), prompt_row["content"], prompt_row["id"],
                        weights_row["id"], weights, icp, threshold, ws_dict, semaphore)
        for lead in leads
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return sum(1 for r in results if r is True)


async def _score_one_lead(
    workspace_id, lead, template, template_id, weights_id, weights, icp, threshold, workspace, sem
) -> bool:
    async with sem:
        try:
            research = {
                "company_summary": lead.get("company_summary", ""),
                "recent_news": lead.get("recent_news", ""),
                "tech_stack": lead.get("tech_stack", []),
                "pain_points": lead.get("pain_points", []),
                "buying_signals": lead.get("buying_signals", []),
                "decision_maker_bio": lead.get("decision_maker_bio", ""),
            }
            score, tokens = await claude_client.score_lead(template, lead, research, weights, icp, workspace=workspace)

            total = score.get("total_score", 0)
            new_status = "archived" if total < threshold else "scored"

            async with db.get_tx() as conn:
                await conn.execute(
                    """
                    INSERT INTO lead_scores
                        (workspace_id, lead_id, total_score, icp_fit_score, buying_intent_score,
                         timing_score, data_quality_score, score_breakdown, weight_version_id,
                         prompt_template_id, tokens_used)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                    """,
                    workspace_id, lead["id"],
                    total,
                    score.get("icp_fit_score"),
                    score.get("buying_intent_score"),
                    score.get("timing_score"),
                    score.get("data_quality_score"),
                    json.dumps(score),
                    weights_id,
                    template_id,
                    tokens,
                )
                await conn.execute(
                    "UPDATE leads SET status = $1 WHERE id = $2", new_status, lead["id"]
                )
            return True
        except Exception as e:
            logger.error(f"[scoring] Lead {lead['id']} failed: {e}")
            return False


# ============================================================
# STAGE 4: PERSONALIZATION
# ============================================================

async def personalize_leads(workspace_id: UUID, batch_size: int = 50, concurrency: int = 5) -> int:
    async with db.get_conn() as conn:
        leads = await conn.fetch(
            """
            SELECT l.*, lr.company_summary, lr.pain_points, lr.buying_signals, lr.recent_news,
                   ls.total_score, ls.score_breakdown
            FROM leads l
            JOIN lead_research lr ON lr.lead_id = l.id
            JOIN lead_scores ls ON ls.lead_id = l.id
            WHERE l.workspace_id = $1 AND l.status = 'scored'
            ORDER BY ls.total_score DESC
            LIMIT $2
            """,
            workspace_id, batch_size,
        )
        templates = {
            t["template_type"]: t["content"]
            for t in await conn.fetch(
                "SELECT template_type, content FROM prompt_templates WHERE workspace_id = $1 AND is_active = true",
                workspace_id,
            )
        }
        workspace = await conn.fetchrow("SELECT * FROM workspaces WHERE id = $1", workspace_id)

    # Require at minimum champion + challenger for body and subject
    required = ["body_champion", "body_challenger", "subject_champion", "subject_challenger"]
    if not leads or not all(k in templates for k in required):
        logger.warning(
            f"[personalization] Missing CCC templates for workspace {workspace_id}. "
            f"Found: {list(templates.keys())}"
        )
        return 0

    ws_dict = dict(workspace)
    semaphore = asyncio.Semaphore(concurrency)
    tasks = [
        _personalize_one_lead(workspace_id, dict(lead), templates, ws_dict, semaphore)
        for lead in leads
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return sum(1 for r in results if r is True)


async def _personalize_one_lead(workspace_id, lead, templates, workspace, sem) -> bool:
    async with sem:
        try:
            research = {
                "company_summary": lead.get("company_summary", ""),
                "pain_points": lead.get("pain_points", []),
                "buying_signals": lead.get("buying_signals", []),
                "recent_news": lead.get("recent_news", ""),
            }
            score_data = lead.get("score_breakdown") or {}

            variants, tokens = await claude_client.generate_ccc_variants(
                templates["body_champion"],
                templates.get("body_challenger", templates["body_champion"]),
                templates.get("body_explorer", templates["body_champion"]),
                templates["subject_champion"],
                templates.get("subject_challenger", templates["subject_champion"]),
                lead, research, score_data, workspace,
            )

            async with db.get_tx() as conn:
                await conn.execute(
                    """
                    INSERT INTO email_variants
                        (workspace_id, lead_id,
                         body_champion, body_challenger, body_explorer,
                         subject_champion, subject_challenger, subject_explorer,
                         tokens_used)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                    """,
                    workspace_id, lead["id"],
                    variants.get("body_champion", ""),
                    variants.get("body_challenger", ""),
                    variants.get("body_explorer", ""),
                    variants.get("subject_champion", ""),
                    variants.get("subject_challenger", ""),
                    variants.get("subject_explorer", ""),
                    tokens,
                )
                await conn.execute(
                    "UPDATE leads SET status = 'personalized' WHERE id = $1", lead["id"]
                )
            return True
        except Exception as e:
            logger.error(f"[personalization] Lead {lead['id']} failed: {e}")
            return False


# ============================================================
# STAGE 5: SENDING
# ============================================================

async def send_leads(workspace_id: UUID, batch_size: int = 100) -> int:
    async with db.get_conn() as conn:
        workspace = await conn.fetchrow(
            "SELECT instantly_api_key, instantly_campaign_id FROM workspaces WHERE id = $1",
            workspace_id,
        )
        if not workspace or not workspace["instantly_api_key"]:
            return 0

        leads = await conn.fetch(
            """
            SELECT l.id, l.email, l.first_name, l.last_name, l.company,
                   ev.id as variant_id,
                   ev.body_champion, ev.body_challenger, ev.body_explorer,
                   ev.subject_champion, ev.subject_challenger, ev.subject_explorer
            FROM leads l
            JOIN email_variants ev ON ev.lead_id = l.id
            WHERE l.workspace_id = $1 AND l.status = 'personalized'
            ORDER BY l.created_at ASC
            LIMIT $2
            """,
            workspace_id, batch_size,
        )

    if not leads:
        return 0

    client = InstantlyClient(workspace["instantly_api_key"])
    campaign_id = workspace["instantly_campaign_id"]
    sent = 0

    # CCC weights: Champion 60%, Challenger 25%, Explorer 15%
    _CCC_POPULATION = (
        ["CHAMPION"] * 60 + ["CHALLENGER"] * 25 + ["EXPLORER"] * 15
    )

    for lead in leads:
        variant_type = random.choice(_CCC_POPULATION)
        if variant_type == "CHAMPION":
            selected_body = lead["body_champion"]
            selected_subject = lead["subject_champion"]
        elif variant_type == "CHALLENGER":
            selected_body = lead["body_challenger"]
            selected_subject = lead["subject_challenger"]
        else:
            selected_body = lead["body_explorer"]
            selected_subject = lead["subject_explorer"]

        # Fallback to champion if explorer/challenger is missing
        if not selected_body:
            selected_body = lead["body_champion"]
            selected_subject = lead["subject_champion"]
            variant_type = "CHAMPION"

        try:
            result = await client.add_lead(
                campaign_id=campaign_id,
                email=lead["email"],
                first_name=lead["first_name"] or "",
                last_name=lead["last_name"] or "",
                company=lead["company"] or "",
                custom_variables={
                    "email_body": selected_body,
                    "email_subject": selected_subject,
                },
            )
            instantly_lead_id = result.get("id") or result.get("lead_id")

            async with db.get_tx() as conn:
                await conn.execute(
                    """
                    INSERT INTO email_sends
                        (workspace_id, lead_id, variant_id, instantly_lead_id, campaign_id,
                         variant_type, status, sent_at)
                    VALUES ($1,$2,$3,$4,$5,$6,'sent', NOW())
                    """,
                    workspace_id, lead["id"], lead["variant_id"],
                    instantly_lead_id, campaign_id, variant_type,
                )
                await conn.execute(
                    "UPDATE leads SET status = 'sent' WHERE id = $1", lead["id"]
                )
            sent += 1
        except Exception as e:
            logger.error(f"[sending] Lead {lead['id']} failed: {e}")

    return sent
