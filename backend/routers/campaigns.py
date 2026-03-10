from uuid import UUID
from fastapi import APIRouter, BackgroundTasks, Query
import db

router = APIRouter()


@router.post("/{workspace_id}/run-pipeline")
async def run_pipeline(workspace_id: UUID, background_tasks: BackgroundTasks):
    from services.email_pipeline import run_pipeline as _run
    background_tasks.add_task(_run, workspace_id)
    return {"status": "started", "message": "Pipeline running in background"}


@router.get("/{workspace_id}/pipeline-status")
async def pipeline_status(workspace_id: UUID):
    async with db.get_conn() as conn:
        counts = await conn.fetch(
            """
            SELECT status, count(*) as count
            FROM leads WHERE workspace_id = $1
            GROUP BY status
            """,
            workspace_id,
        )
        recent_sends = await conn.fetchval(
            """
            SELECT count(*) FROM email_sends
            WHERE workspace_id = $1 AND sent_at >= NOW() - interval '24 hours'
            """,
            workspace_id,
        )
        workspace = await conn.fetchrow(
            "SELECT status, daily_lead_target FROM workspaces WHERE id = $1", workspace_id
        )
    return {
        "workspace_status": workspace["status"] if workspace else None,
        "daily_lead_target": workspace["daily_lead_target"] if workspace else None,
        "pipeline_counts": {r["status"]: r["count"] for r in counts},
        "emails_last_24h": recent_sends,
    }
