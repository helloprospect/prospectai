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
