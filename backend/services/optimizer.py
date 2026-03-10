"""
Self-optimization engine.
Runs nightly per workspace. Pulls Instantly stats, calculates metrics,
asks Claude to improve prompts/weights, writes back to DB.
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


async def run_optimization(workspace_id: UUID, run_type: str = "nightly"):
    logger.info(f"[optimizer] Starting {run_type} run for workspace {workspace_id}")

    async with db.get_conn() as conn:
        workspace = await conn.fetchrow("SELECT * FROM workspaces WHERE id = $1", workspace_id)

    if not workspace or workspace["status"] not in ("active", "paused"):
        logger.info(f"[optimizer] Workspace {workspace_id} not eligible, skipping")
        return

    async with db.get_conn() as conn:
        # Sync latest Instantly performance first
        synced = await sync_performance_for_workspace(workspace_id, conn)
        logger.info(f"[optimizer] Synced {synced} performance records")

        # Gather analysis data
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

    if emails_analyzed < 30:
        await _save_run(workspace_id, run_type, metrics, benchmark, changes={},
                        reasoning="Insufficient data for optimization (need 30+ sent emails).",
                        confidence=0.0, status="skipped_insufficient_data")
        logger.info("[optimizer] Insufficient data, skipping")
        return

    # Build performance report for Claude
    performance_report = _build_performance_report(metrics, benchmark, safety.warnings)

    # Ask Claude for optimization recommendations
    try:
        raw_changes, tokens = await claude_client.run_optimization_analysis(
            performance_report, current_prompts, current_weights, benchmark
        )
    except Exception as e:
        logger.error(f"[optimizer] Claude analysis failed: {e}")
        return

    confidence = raw_changes.get("confidence", 0.0)
    apply_mode = determine_apply_mode(confidence)

    # Validate and clamp changes
    sanitized, warnings = validate_claude_output(
        raw_changes, current_weights, emails_analyzed, confidence
    )
    if warnings:
        logger.info(f"[optimizer] Safety adjustments: {warnings}")

    # Determine final status
    if apply_mode == "skip":
        status = "skipped_insufficient_data"
        logger.info(f"[optimizer] Confidence {confidence:.2f} too low, skipping changes")
    elif apply_mode == "needs_review":
        status = "needs_review"
        logger.info(f"[optimizer] Confidence {confidence:.2f} — queued for human review")
    else:
        # Auto-apply
        async with db.get_tx() as conn:
            await _apply_changes(conn, workspace_id, sanitized)
        status = "completed"
        logger.info(f"[optimizer] Changes auto-applied (confidence {confidence:.2f})")

    reasoning = raw_changes.get("analysis", "") + (
        ("\n\nSafety adjustments: " + "; ".join(warnings)) if warnings else ""
    )
    await _save_run(
        workspace_id, run_type, metrics, benchmark,
        changes=sanitized if apply_mode != "skip" else {},
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
# Data collection
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
            count(*) FILTER (WHERE ep.replied AND ep.reply_sentiment = 'positive') AS positive_replies,
            count(*) FILTER (WHERE ep.bounced) AS bounced
        FROM email_performance ep
        JOIN email_sends es ON ep.send_id = es.id
        WHERE es.workspace_id = $1
          AND es.sent_at::date BETWEEN $2 AND $3
        """,
        workspace_id, period_start, period_end,
    )

    total = row["total_sent"] or 1  # avoid division by zero
    open_rate = (row["total_opened"] or 0) / total
    reply_rate = (row["total_replied"] or 0) / total
    positive_rate = (row["positive_replies"] or 0) / total

    # By variant
    variant_rows = await conn.fetch(
        """
        SELECT es.body_variant, es.subject_variant,
               count(*) AS sent,
               count(*) FILTER (WHERE ep.replied) AS replied
        FROM email_performance ep
        JOIN email_sends es ON ep.send_id = es.id
        WHERE es.workspace_id = $1 AND es.sent_at::date BETWEEN $2 AND $3
        GROUP BY es.body_variant, es.subject_variant
        """,
        workspace_id, period_start, period_end,
    )

    # By ICP segment (industry)
    segment_rows = await conn.fetch(
        """
        SELECT l.industry,
               count(*) AS sent,
               count(*) FILTER (WHERE ep.replied) AS replied
        FROM email_performance ep
        JOIN email_sends es ON ep.send_id = es.id
        JOIN leads l ON l.id = es.lead_id
        WHERE es.workspace_id = $1 AND es.sent_at::date BETWEEN $2 AND $3
          AND l.industry IS NOT NULL
        GROUP BY l.industry
        ORDER BY replied DESC
        LIMIT 10
        """,
        workspace_id, period_start, period_end,
    )

    # By score band
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
            count(*) FILTER (WHERE ep.replied) AS replied
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

    row = await conn.fetchrow(
        "SELECT * FROM industry_benchmarks WHERE industry = $1", primary
    )
    if not row:
        row = await conn.fetchrow("SELECT * FROM industry_benchmarks WHERE industry = 'general'")
    return dict(row) if row else {}


def _build_performance_report(metrics: dict, benchmark: dict, warnings: list[str]) -> str:
    def pct(v): return f"{v:.1%}" if v is not None else "N/A"
    def rate(sent, replied): return f"{replied/sent:.1%}" if sent else "N/A"

    variants_text = "\n".join(
        f"  Body {r['body_variant']} / Subject {r['subject_variant']}: "
        f"{rate(r['sent'], r['replied'])} reply rate (n={r['sent']})"
        for r in metrics["variants"]
    ) or "  No variant data yet"

    segments_text = "\n".join(
        f"  {r['industry']}: {rate(r['sent'], r['replied'])} reply rate (n={r['sent']})"
        for r in metrics["segments"]
    ) or "  No segment data yet"

    score_bands_text = "\n".join(
        f"  Score {r['score_band']}: {rate(r['sent'], r['replied'])} reply rate (n={r['sent']})"
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

A/B Variant Breakdown:
{variants_text}

Performance by ICP Segment (Industry):
{segments_text}

Score Band vs Conversion:
{score_bands_text}

Safety Warnings:
{warnings_text}"""


# ============================================================
# Write back to DB
# ============================================================

async def _apply_changes(conn, workspace_id: UUID, changes: dict):
    from datetime import datetime, timezone

    prompt_changes = changes.get("prompt_changes", [])
    for change in prompt_changes:
        template_type = change.get("template_type")
        new_content = change.get("new_content")
        if not template_type or not new_content:
            continue

        await conn.execute(
            "UPDATE prompt_templates SET is_active = false, retired_at = $1 WHERE workspace_id = $2 AND template_type = $3 AND is_active = true",
            datetime.now(timezone.utc), workspace_id, template_type,
        )
        version = await conn.fetchval(
            "SELECT coalesce(max(version), 0) + 1 FROM prompt_templates WHERE workspace_id = $1 AND template_type = $2",
            workspace_id, template_type,
        )
        await conn.execute(
            "INSERT INTO prompt_templates (workspace_id, template_type, version, content, is_active, created_by) VALUES ($1,$2,$3,$4,true,'claude_optimizer')",
            workspace_id, template_type, version, new_content,
        )

    weight_changes = changes.get("weight_changes")
    if weight_changes:
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
            0,  # leads_analyzed not separately tracked here
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
