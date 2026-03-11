"""
Self-optimization engine — Champion / Challenger / Explorer framework.

Runs nightly per workspace:
1. Sync latest Instantly performance data
2. Rank body variants + subject variants by positive reply rate
3. Promote best → champion, 2nd best → challenger
4. Refresh explorer: if current explorer has ≥50 samples → generate new one via Claude
5. Update scoring weights via Claude analysis
6. Write audit log to optimization_runs
"""
import json
import logging
from datetime import date, timedelta
from uuid import UUID

import db
from services.instantly_sync import sync_performance_for_workspace
from services import claude_client
from services.safety import (
    check_before_optimization,
    validate_claude_output,
    determine_apply_mode,
)

logger = logging.getLogger(__name__)

# Minimum samples before a variant is eligible for promotion
MIN_SAMPLES_FOR_PROMOTION = 50


async def run_optimization(workspace_id: UUID, run_type: str = "nightly"):
    logger.info(f"[optimizer] Starting {run_type} run for workspace {workspace_id}")

    async with db.get_conn() as conn:
        workspace = await conn.fetchrow("SELECT * FROM workspaces WHERE id = $1", workspace_id)

    if not workspace or workspace["status"] not in ("active", "paused"):
        logger.info(f"[optimizer] Workspace {workspace_id} not eligible, skipping")
        return

    async with db.get_conn() as conn:
        synced = await sync_performance_for_workspace(workspace_id, conn)
        logger.info(f"[optimizer] Synced {synced} performance records")

        metrics = await _calculate_metrics(conn, workspace_id)
        current_prompts = await _load_active_prompts(conn, workspace_id)
        current_weights_row = await conn.fetchrow(
            "SELECT * FROM scoring_weights WHERE workspace_id = $1 AND is_active = true",
            workspace_id,
        )
        benchmark = await _load_benchmark(conn, workspace)

    if not current_weights_row:
        logger.warning(f"[optimizer] No active scoring weights for workspace {workspace_id}")
        return

    current_weights = current_weights_row["weights"] or {}
    emails_analyzed = metrics["total_sent"]
    avg_open_rate = metrics["open_rate"]

    # Safety pre-check
    safety = check_before_optimization(emails_analyzed, avg_open_rate)
    if not safety.should_run:
        await _save_run(workspace_id, run_type, metrics, benchmark, changes={},
                        reasoning=safety.skip_reason, confidence=0.0,
                        status="paused_anomaly")
        logger.warning(f"[optimizer] {safety.skip_reason}")
        return

    ccc_changes = {}
    ccc_reasoning = []

    # ── CCC: Rank and promote variants ──────────────────────────────────────
    if emails_analyzed >= 30:
        async with db.get_tx() as conn:
            body_result = await _rank_and_promote(conn, workspace_id, "body")
            subject_result = await _rank_and_promote(conn, workspace_id, "subject")

        if body_result:
            ccc_changes["body_promotions"] = body_result
            ccc_reasoning.append(f"Body: {body_result}")
        if subject_result:
            ccc_changes["subject_promotions"] = subject_result
            ccc_reasoning.append(f"Subject: {subject_result}")

    # ── CCC: Refresh explorer if ready ──────────────────────────────────────
    for variant_axis in ("body", "subject"):
        async with db.get_conn() as conn:
            explorer_stats = await _get_variant_stats_for_type(
                conn, workspace_id, f"{variant_axis}_explorer"
            )

        if explorer_stats and explorer_stats["sent"] >= MIN_SAMPLES_FOR_PROMOTION:
            logger.info(f"[optimizer] {variant_axis}_explorer has {explorer_stats['sent']} samples → refreshing")
            async with db.get_conn() as conn:
                perf_data = await _load_variant_performance_with_examples(conn, workspace_id, variant_axis)
                champion_content = await _load_template_content(conn, workspace_id, f"{variant_axis}_champion")

            if champion_content:
                try:
                    new_explorer, tokens = await claude_client.generate_explorer_prompt(
                        perf_data, champion_content, variant_axis, dict(workspace)
                    )
                    async with db.get_tx() as conn:
                        await _retire_and_create_template(
                            conn, workspace_id, f"{variant_axis}_explorer", new_explorer
                        )
                    ccc_changes[f"{variant_axis}_explorer_refreshed"] = True
                    ccc_reasoning.append(f"New {variant_axis} explorer generated (prev had {explorer_stats['sent']} samples)")
                    logger.info(f"[optimizer] New {variant_axis} explorer written to DB")
                except Exception as e:
                    logger.error(f"[optimizer] Explorer generation failed for {variant_axis}: {e}")

    # ── Scoring weight optimization via Claude ───────────────────────────────
    if emails_analyzed >= 30:
        performance_report = _build_performance_report(metrics, benchmark, safety.warnings)

        try:
            raw_changes, _ = await claude_client.run_optimization_analysis(
                performance_report, current_prompts, current_weights, benchmark
            )
        except Exception as e:
            logger.error(f"[optimizer] Claude weight analysis failed: {e}")
            raw_changes = {"confidence": 0.0, "analysis": str(e)}

        confidence = raw_changes.get("confidence", 0.0)
        apply_mode = determine_apply_mode(confidence)

        sanitized, warnings = validate_claude_output(
            raw_changes, current_weights, emails_analyzed, confidence
        )
        if warnings:
            logger.info(f"[optimizer] Safety adjustments: {warnings}")

        if apply_mode == "auto":
            # Only apply weight changes, NOT prompt rewrites (CCC handles prompts now)
            weight_only = {
                "weight_changes": sanitized.get("weight_changes"),
                "threshold_recommendation": sanitized.get("threshold_recommendation"),
            }
            async with db.get_tx() as conn:
                await _apply_weight_changes(conn, workspace_id, weight_only)
            ccc_changes["weight_update"] = weight_only
            status = "completed"
            logger.info(f"[optimizer] Weights auto-applied (confidence {confidence:.2f})")
        elif apply_mode == "needs_review":
            status = "needs_review"
        else:
            status = "skipped_insufficient_data"

        reasoning = (raw_changes.get("analysis", "") + "\n\n" + "\n".join(ccc_reasoning)).strip()
    else:
        confidence = 0.0
        status = "skipped_insufficient_data" if not ccc_changes else "completed"
        reasoning = "\n".join(ccc_reasoning) if ccc_reasoning else "Insufficient data (need 30+ sent emails)"

    await _save_run(
        workspace_id, run_type, metrics, benchmark,
        changes=ccc_changes,
        reasoning=reasoning,
        confidence=confidence,
        status=status,
    )


async def run_optimization_for_all_workspaces():
    """Called by APScheduler nightly."""
    async with db.get_conn() as conn:
        workspace_ids = await conn.fetch(
            "SELECT id FROM workspaces WHERE status = 'active'"
        )
    for row in workspace_ids:
        try:
            await run_optimization(row["id"], run_type="nightly")
        except Exception as e:
            logger.error(f"[optimizer] Workspace {row['id']} failed: {e}")


# ============================================================
# CCC: Rank / Promote
# ============================================================

async def _rank_and_promote(conn, workspace_id: UUID, variant_axis: str) -> dict | None:
    """
    Rank body or subject variants by positive reply rate (≥50 samples).
    Promote: rank 1 → champion, rank 2 → challenger.
    Returns dict of changes made, or None if no changes.
    """
    stats = await _get_all_variant_stats(conn, workspace_id, variant_axis)

    # Only rank variants with enough data
    eligible = [s for s in stats if s["sent"] >= MIN_SAMPLES_FOR_PROMOTION]
    if len(eligible) < 2:
        return None  # Not enough data to rank

    ranked = sorted(eligible, key=lambda x: x["positive_rate"], reverse=True)
    role_map = {
        0: f"{variant_axis}_champion",
        1: f"{variant_axis}_challenger",
    }

    changes = {}
    for i, stat in enumerate(ranked[:2]):
        desired_role = role_map[i]
        current_role = stat["template_type"]
        if current_role != desired_role:
            await _rename_template_role(conn, workspace_id, current_role, desired_role)
            changes[desired_role] = {
                "from": current_role,
                "positive_rate": stat["positive_rate"],
                "sent": stat["sent"],
            }
            logger.info(f"[optimizer] Promoted {current_role} → {desired_role} (rate={stat['positive_rate']:.2%}, n={stat['sent']})")

    return changes if changes else None


async def _get_all_variant_stats(conn, workspace_id: UUID, variant_axis: str) -> list[dict]:
    """Get reply stats for all active variants of a given axis (body or subject)."""
    rows = await conn.fetch(
        """
        SELECT
            ev.body_template_type  AS template_type,
            count(*)               AS sent,
            count(*) FILTER (WHERE ep.instantly_interest_status IN (1, 2, 3)) AS positive,
            count(*) FILTER (WHERE ep.instantly_interest_status IN (-1, -2, -3)) AS negative
        FROM email_sends es
        JOIN email_variants ev ON ev.id = es.variant_id
        LEFT JOIN email_performance ep ON ep.send_id = es.id
        WHERE es.workspace_id = $1
          AND ev.body_template_type LIKE $2
        GROUP BY ev.body_template_type
        """,
        workspace_id, f"{variant_axis}_%",
    ) if variant_axis == "body" else await conn.fetch(
        """
        SELECT
            ev.subject_template_type AS template_type,
            count(*)                 AS sent,
            count(*) FILTER (WHERE ep.instantly_interest_status IN (1, 2, 3)) AS positive,
            count(*) FILTER (WHERE ep.instantly_interest_status IN (-1, -2, -3)) AS negative
        FROM email_sends es
        JOIN email_variants ev ON ev.id = es.variant_id
        LEFT JOIN email_performance ep ON ep.send_id = es.id
        WHERE es.workspace_id = $1
          AND ev.subject_template_type LIKE $2
        GROUP BY ev.subject_template_type
        """,
        workspace_id, f"{variant_axis}_%",
    )

    result = []
    for r in rows:
        sent = r["sent"] or 0
        positive = r["positive"] or 0
        result.append({
            "template_type": r["template_type"],
            "sent": sent,
            "positive_count": positive,
            "negative_count": r["negative"] or 0,
            "positive_rate": positive / sent if sent > 0 else 0.0,
        })
    return result


async def _get_variant_stats_for_type(conn, workspace_id: UUID, template_type: str) -> dict | None:
    """Stats for one specific template_type."""
    axis = "body" if template_type.startswith("body_") else "subject"
    all_stats = await _get_all_variant_stats(conn, workspace_id, axis)
    for s in all_stats:
        if s["template_type"] == template_type:
            return s
    return None


async def _rename_template_role(conn, workspace_id: UUID, old_type: str, new_type: str):
    """Rename a template_type — effectively promotes/demotes a variant."""
    await conn.execute(
        "UPDATE prompt_templates SET template_type = $1 WHERE workspace_id = $2 AND template_type = $3 AND is_active = true",
        new_type, workspace_id, old_type,
    )


# ============================================================
# CCC: Explorer Refresh
# ============================================================

async def _load_variant_performance_with_examples(
    conn, workspace_id: UUID, variant_axis: str
) -> list[dict]:
    """Load variant stats + example subject lines and icebreakers for Claude's analysis."""
    stats = await _get_all_variant_stats(conn, workspace_id, variant_axis)

    enriched = []
    for stat in stats:
        template_type = stat["template_type"]

        # Fetch positive examples (subject + first sentence of body)
        positive_ex = await conn.fetch(
            f"""
            SELECT ev.subject_text, substring(ev.body_text, 1, 150) AS icebreaker
            FROM email_sends es
            JOIN email_variants ev ON ev.id = es.variant_id
            JOIN email_performance ep ON ep.send_id = es.id
            WHERE es.workspace_id = $1
              AND ev.{"body" if variant_axis == "body" else "subject"}_template_type = $2
              AND ep.instantly_interest_status IN (1, 2, 3)
            LIMIT 3
            """,
            workspace_id, template_type,
        )

        negative_ex = await conn.fetch(
            f"""
            SELECT ev.subject_text, substring(ev.body_text, 1, 150) AS icebreaker
            FROM email_sends es
            JOIN email_variants ev ON ev.id = es.variant_id
            JOIN email_performance ep ON ep.send_id = es.id
            WHERE es.workspace_id = $1
              AND ev.{"body" if variant_axis == "body" else "subject"}_template_type = $2
              AND ep.instantly_interest_status IN (-1, -2, -3)
            LIMIT 2
            """,
            workspace_id, template_type,
        )

        enriched.append({
            **stat,
            "positive_examples": [dict(r) for r in positive_ex],
            "negative_examples": [dict(r) for r in negative_ex],
        })

    return enriched


async def _load_template_content(conn, workspace_id: UUID, template_type: str) -> str | None:
    row = await conn.fetchrow(
        "SELECT content FROM prompt_templates WHERE workspace_id = $1 AND template_type = $2 AND is_active = true",
        workspace_id, template_type,
    )
    return row["content"] if row else None


async def _retire_and_create_template(conn, workspace_id: UUID, template_type: str, new_content: str):
    """Retire current explorer and insert new one."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    await conn.execute(
        "UPDATE prompt_templates SET is_active = false, retired_at = $1 WHERE workspace_id = $2 AND template_type = $3 AND is_active = true",
        now, workspace_id, template_type,
    )
    version = await conn.fetchval(
        "SELECT coalesce(max(version), 0) + 1 FROM prompt_templates WHERE workspace_id = $1 AND template_type = $2",
        workspace_id, template_type,
    )
    await conn.execute(
        "INSERT INTO prompt_templates (workspace_id, template_type, version, content, is_active, created_by) VALUES ($1,$2,$3,$4,true,'claude_optimizer')",
        workspace_id, template_type, version, new_content,
    )


# ============================================================
# Scoring weight optimization (unchanged logic)
# ============================================================

async def _calculate_metrics(conn, workspace_id: UUID) -> dict:
    period_end = date.today()
    period_start = period_end - timedelta(days=7)

    row = await conn.fetchrow(
        """
        SELECT
            count(*) AS total_sent,
            count(*) FILTER (WHERE ep.opened) AS total_opened,
            count(*) FILTER (WHERE ep.replied) AS total_replied,
            count(*) FILTER (WHERE ep.instantly_interest_status IN (1,2,3)) AS positive_replies,
            count(*) FILTER (WHERE ep.bounced) AS bounced
        FROM email_performance ep
        JOIN email_sends es ON ep.send_id = es.id
        WHERE es.workspace_id = $1
          AND es.sent_at::date BETWEEN $2 AND $3
        """,
        workspace_id, period_start, period_end,
    )

    total = row["total_sent"] or 1
    open_rate = (row["total_opened"] or 0) / total
    reply_rate = (row["total_replied"] or 0) / total
    positive_rate = (row["positive_replies"] or 0) / total

    # By variant combo
    variant_rows = await conn.fetch(
        """
        SELECT es.body_variant, es.subject_variant,
               count(*) AS sent,
               count(*) FILTER (WHERE ep.instantly_interest_status IN (1,2,3)) AS positive,
               count(*) FILTER (WHERE ep.replied) AS replied
        FROM email_performance ep
        JOIN email_sends es ON ep.send_id = es.id
        WHERE es.workspace_id = $1 AND es.sent_at::date BETWEEN $2 AND $3
        GROUP BY es.body_variant, es.subject_variant
        """,
        workspace_id, period_start, period_end,
    )

    segment_rows = await conn.fetch(
        """
        SELECT l.industry,
               count(*) AS sent,
               count(*) FILTER (WHERE ep.instantly_interest_status IN (1,2,3)) AS positive
        FROM email_performance ep
        JOIN email_sends es ON ep.send_id = es.id
        JOIN leads l ON l.id = es.lead_id
        WHERE es.workspace_id = $1 AND es.sent_at::date BETWEEN $2 AND $3
          AND l.industry IS NOT NULL
        GROUP BY l.industry
        ORDER BY positive DESC
        LIMIT 10
        """,
        workspace_id, period_start, period_end,
    )

    score_rows = await conn.fetch(
        """
        SELECT
            CASE
                WHEN ls.total_score >= 70 THEN '70-100'
                WHEN ls.total_score >= 55 THEN '55-69'
                WHEN ls.total_score >= 40 THEN '40-54'
                ELSE '<40'
            END AS score_band,
            count(*) AS sent,
            count(*) FILTER (WHERE ep.instantly_interest_status IN (1,2,3)) AS positive
        FROM email_performance ep
        JOIN email_sends es ON ep.send_id = es.id
        JOIN lead_scores ls ON ls.lead_id = es.lead_id
        WHERE es.workspace_id = $1 AND es.sent_at::date BETWEEN $2 AND $3
        GROUP BY 1 ORDER BY 1
        """,
        workspace_id, period_start, period_end,
    )

    return {
        "period_start": period_start,
        "period_end": period_end,
        "total_sent": row["total_sent"] or 0,
        "total_opened": row["total_opened"] or 0,
        "total_replied": row["total_replied"] or 0,
        "positive_replies": row["positive_replies"] or 0,
        "bounced": row["bounced"] or 0,
        "open_rate": open_rate,
        "reply_rate": reply_rate,
        "positive_rate": positive_rate,
        "variants": [dict(r) for r in variant_rows],
        "segments": [dict(r) for r in segment_rows],
        "score_bands": [dict(r) for r in score_rows],
    }


async def _load_active_prompts(conn, workspace_id: UUID) -> dict[str, str]:
    rows = await conn.fetch(
        "SELECT template_type, content FROM prompt_templates WHERE workspace_id = $1 AND is_active = true",
        workspace_id,
    )
    return {r["template_type"]: r["content"] for r in rows}


async def _load_benchmark(conn, workspace) -> dict:
    icp = workspace["icp_config"] or {}
    industries = icp.get("industries", [])
    primary = industries[0] if industries else "general"

    row = await conn.fetchrow("SELECT * FROM industry_benchmarks WHERE industry = $1", primary)
    if not row:
        row = await conn.fetchrow("SELECT * FROM industry_benchmarks WHERE industry = 'general'")
    return dict(row) if row else {}


def _build_performance_report(metrics: dict, benchmark: dict, warnings: list[str]) -> str:
    def pct(v): return f"{v:.1%}" if v is not None else "N/A"
    def rate(sent, positive): return f"{positive/sent:.1%}" if sent else "N/A"

    variants_text = "\n".join(
        f"  {r['body_variant']} / {r['subject_variant']}: "
        f"{rate(r['sent'], r.get('positive', r.get('replied', 0)))} positive rate (n={r['sent']})"
        for r in metrics["variants"]
    ) or "  No variant data yet"

    segments_text = "\n".join(
        f"  {r['industry']}: {rate(r['sent'], r.get('positive', 0))} positive rate (n={r['sent']})"
        for r in metrics["segments"]
    ) or "  No segment data yet"

    score_bands_text = "\n".join(
        f"  Score {r['score_band']}: {rate(r['sent'], r.get('positive', 0))} positive rate (n={r['sent']})"
        for r in metrics["score_bands"]
    ) or "  No score band data yet"

    warnings_text = "\n".join(f"  ⚠ {w}" for w in warnings) if warnings else "  None"

    return f"""PERFORMANCE REPORT — {metrics['period_start']} to {metrics['period_end']}

Overall Metrics (last 7 days):
  Emails sent:      {metrics['total_sent']}
  Open rate:        {pct(metrics['open_rate'])}  (benchmark: {pct(benchmark.get('avg_open_rate'))})
  Reply rate:       {pct(metrics['reply_rate'])}  (benchmark: {pct(benchmark.get('avg_reply_rate'))})
  Positive replies: {pct(metrics['positive_rate'])}  (top 10%: {pct(benchmark.get('top_decile_reply_rate'))})
  Bounced:          {metrics['bounced']}

A/B Variant Breakdown (Champion/Challenger/Explorer):
{variants_text}

Performance by ICP Segment:
{segments_text}

Score Band vs Conversion:
{score_bands_text}

Safety Warnings:
{warnings_text}"""


async def _apply_weight_changes(conn, workspace_id: UUID, changes: dict):
    from datetime import datetime, timezone

    weight_changes = changes.get("weight_changes")
    if not weight_changes:
        return

    await conn.execute(
        "UPDATE scoring_weights SET is_active = false WHERE workspace_id = $1 AND is_active = true",
        workspace_id,
    )
    new_version = await conn.fetchval(
        "SELECT coalesce(max(version), 0) + 1 FROM scoring_weights WHERE workspace_id = $1",
        workspace_id,
    )
    threshold = changes.get("threshold_recommendation")
    clean_weights = {k: v for k, v in weight_changes.items() if k != "rationale" and isinstance(v, (int, float))}
    await conn.execute(
        "INSERT INTO scoring_weights (workspace_id, version, is_active, weights, min_score_threshold, rationale) VALUES ($1,$2,true,$3,$4,$5)",
        workspace_id, new_version,
        json.dumps(clean_weights),
        threshold,
        weight_changes.get("rationale"),
    )


async def _save_run(
    workspace_id: UUID,
    run_type: str,
    metrics: dict,
    benchmark: dict,
    changes: dict,
    reasoning: str,
    confidence: float,
    status: str,
):
    async with db.get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO optimization_runs
                (workspace_id, run_type, period_start, period_end,
                 leads_analyzed, emails_analyzed,
                 avg_open_rate, avg_reply_rate,
                 benchmark_open_rate, benchmark_reply_rate,
                 changes_made, claude_reasoning, confidence, status)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
            """,
            workspace_id, run_type,
            metrics.get("period_start"), metrics.get("period_end"),
            0,
            metrics.get("total_sent", 0),
            metrics.get("open_rate"),
            metrics.get("reply_rate"),
            benchmark.get("avg_open_rate"),
            benchmark.get("avg_reply_rate"),
            json.dumps(changes),
            reasoning,
            confidence,
            status,
        )
