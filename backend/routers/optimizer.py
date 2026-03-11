from uuid import UUID
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
import db

router = APIRouter()


@router.get("/{workspace_id}/runs")
async def list_optimization_runs(workspace_id: UUID, limit: int = Query(20, le=100)):
    async with db.get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT id, run_type, period_start, period_end,
                   leads_analyzed, emails_analyzed,
                   avg_open_rate, avg_reply_rate,
                   benchmark_open_rate, benchmark_reply_rate,
                   changes_made, claude_reasoning, confidence, status, ran_at
            FROM optimization_runs
            WHERE workspace_id = $1
            ORDER BY ran_at DESC
            LIMIT $2
            """,
            workspace_id, limit,
        )
    return [dict(r) for r in rows]


@router.post("/{workspace_id}/run")
async def trigger_optimization(workspace_id: UUID, background_tasks: BackgroundTasks):
    from services.optimizer import run_optimization
    background_tasks.add_task(run_optimization, workspace_id, run_type="manual")
    return {"status": "started", "message": "Optimization running in background"}


@router.post("/{workspace_id}/runs/{run_id}/approve")
async def approve_optimization(workspace_id: UUID, run_id: UUID):
    async with db.get_conn() as conn:
        run = await conn.fetchrow(
            "SELECT * FROM optimization_runs WHERE id = $1 AND workspace_id = $2",
            run_id, workspace_id,
        )
        if not run:
            raise HTTPException(404, "Optimization run not found")
        if run["status"] != "needs_review":
            raise HTTPException(400, f"Run status is '{run['status']}', only 'needs_review' can be approved")

        changes = run["changes_made"] or {}
        await _apply_optimizer_changes(conn, workspace_id, run_id, changes)

        await conn.execute(
            "UPDATE optimization_runs SET status = 'completed' WHERE id = $1", run_id
        )
    return {"status": "approved", "changes_applied": changes}


@router.get("/{workspace_id}/prompts")
async def list_prompts(workspace_id: UUID):
    async with db.get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT id, template_type, version, is_active,
                   performance_score, created_by, created_at, retired_at,
                   left(content, 200) as content_preview
            FROM prompt_templates
            WHERE workspace_id = $1
            ORDER BY template_type, version DESC
            """,
            workspace_id,
        )
    return [dict(r) for r in rows]


@router.get("/{workspace_id}/variants")
async def get_variant_status(workspace_id: UUID):
    """
    Returns Champion/Challenger/Explorer status for body and subject variants.
    Used by the /variants frontend page.
    """
    async with db.get_conn() as conn:
        # Active templates with their version numbers
        templates = await conn.fetch(
            """
            SELECT template_type, version, created_by, created_at,
                   left(content, 300) AS content_preview
            FROM prompt_templates
            WHERE workspace_id = $1 AND is_active = true
              AND template_type IN (
                  'body_champion', 'body_challenger', 'body_explorer',
                  'subject_champion', 'subject_challenger', 'subject_explorer'
              )
            """,
            workspace_id,
        )
        template_map = {r["template_type"]: dict(r) for r in templates}

        # Performance stats per variant type (last 30 days)
        body_stats = await conn.fetch(
            """
            SELECT
                ev.body_template_type AS variant_type,
                count(*) AS sent,
                count(*) FILTER (WHERE ep.instantly_interest_status IN (1,2,3)) AS positive,
                count(*) FILTER (WHERE ep.instantly_interest_status IN (-1,-2,-3)) AS negative
            FROM email_sends es
            JOIN email_variants ev ON ev.id = es.variant_id
            LEFT JOIN email_performance ep ON ep.send_id = es.id
            WHERE es.workspace_id = $1
              AND es.sent_at >= NOW() - interval '30 days'
              AND ev.body_template_type IS NOT NULL
            GROUP BY ev.body_template_type
            """,
            workspace_id,
        )
        subject_stats = await conn.fetch(
            """
            SELECT
                ev.subject_template_type AS variant_type,
                count(*) AS sent,
                count(*) FILTER (WHERE ep.instantly_interest_status IN (1,2,3)) AS positive,
                count(*) FILTER (WHERE ep.instantly_interest_status IN (-1,-2,-3)) AS negative
            FROM email_sends es
            JOIN email_variants ev ON ev.id = es.variant_id
            LEFT JOIN email_performance ep ON ep.send_id = es.id
            WHERE es.workspace_id = $1
              AND es.sent_at >= NOW() - interval '30 days'
              AND ev.subject_template_type IS NOT NULL
            GROUP BY ev.subject_template_type
            """,
            workspace_id,
        )

        # Last optimization run
        last_run = await conn.fetchrow(
            "SELECT ran_at, status, claude_reasoning, changes_made FROM optimization_runs WHERE workspace_id = $1 ORDER BY ran_at DESC LIMIT 1",
            workspace_id,
        )

    stats_map = {}
    for r in list(body_stats) + list(subject_stats):
        sent = r["sent"] or 0
        positive = r["positive"] or 0
        negative = r["negative"] or 0
        stats_map[r["variant_type"]] = {
            "sent": sent,
            "positive": positive,
            "negative": negative,
            "no_reply": sent - positive - negative,
            "positive_rate": round(positive / sent, 4) if sent > 0 else 0.0,
            "confidence": "high" if sent >= 50 else "medium" if sent >= 20 else "low",
            "samples_needed": max(0, 50 - sent),
        }

    MIN_SAMPLES = 50

    def build_variant(template_type: str, weight: float) -> dict:
        tmpl = template_map.get(template_type)
        stats = stats_map.get(template_type, {"sent": 0, "positive": 0, "negative": 0, "no_reply": 0, "positive_rate": 0.0, "confidence": "low", "samples_needed": MIN_SAMPLES})
        return {
            "type": template_type,
            "weight": weight,
            "version": tmpl["version"] if tmpl else None,
            "created_by": tmpl["created_by"] if tmpl else None,
            "content_preview": tmpl["content_preview"] if tmpl else None,
            **stats,
        }

    return {
        "body": {
            "champion":   build_variant("body_champion", 0.60),
            "challenger": build_variant("body_challenger", 0.25),
            "explorer":   build_variant("body_explorer", 0.15),
        },
        "subject": {
            "champion":   build_variant("subject_champion", 0.60),
            "challenger": build_variant("subject_challenger", 0.25),
            "explorer":   build_variant("subject_explorer", 0.15),
        },
        "last_optimization": dict(last_run) if last_run else None,
    }


@router.get("/{workspace_id}/weights")
async def list_weights(workspace_id: UUID):
    async with db.get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT id, version, is_active, weights, min_score_threshold,
                   rationale, created_at
            FROM scoring_weights
            WHERE workspace_id = $1
            ORDER BY version DESC
            """,
            workspace_id,
        )
    return [dict(r) for r in rows]


async def _apply_optimizer_changes(conn, workspace_id: UUID, run_id: UUID, changes: dict):
    import json
    from datetime import datetime, timezone

    prompt_changes = changes.get("prompt_changes", [])
    for change in prompt_changes:
        template_type = change["template_type"]
        new_content = change["new_content"]

        # Retire active template
        await conn.execute(
            """
            UPDATE prompt_templates
            SET is_active = false, retired_at = $1
            WHERE workspace_id = $2 AND template_type = $3 AND is_active = true
            """,
            datetime.now(timezone.utc), workspace_id, template_type,
        )
        # Get next version
        version = await conn.fetchval(
            "SELECT coalesce(max(version), 0) + 1 FROM prompt_templates WHERE workspace_id = $1 AND template_type = $2",
            workspace_id, template_type,
        )
        await conn.execute(
            """
            INSERT INTO prompt_templates
                (workspace_id, template_type, version, content, is_active, created_by)
            VALUES ($1, $2, $3, $4, true, 'claude_optimizer')
            """,
            workspace_id, template_type, version, new_content,
        )

    weight_changes = changes.get("weight_changes")
    if weight_changes:
        await conn.execute(
            "UPDATE scoring_weights SET is_active = false WHERE workspace_id = $1 AND is_active = true",
            workspace_id,
        )
        current_version = await conn.fetchval(
            "SELECT coalesce(max(version), 0) + 1 FROM scoring_weights WHERE workspace_id = $1",
            workspace_id,
        )
        threshold = changes.get("threshold_recommendation")
        await conn.execute(
            """
            INSERT INTO scoring_weights
                (workspace_id, version, is_active, weights, min_score_threshold, rationale)
            VALUES ($1, $2, true, $3, $4, $5)
            """,
            workspace_id,
            current_version,
            json.dumps({k: v for k, v in weight_changes.items() if k != "rationale"}),
            threshold,
            weight_changes.get("rationale"),
        )
