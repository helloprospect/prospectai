from uuid import UUID
from fastapi import APIRouter, Query
import db

router = APIRouter()


@router.get("/{workspace_id}/posts")
async def list_reddit_posts(
    workspace_id: UUID,
    limit: int = Query(50, le=200),
    action: str | None = Query(None),
):
    async with db.get_conn() as conn:
        if action:
            rows = await conn.fetch(
                "SELECT * FROM reddit_posts WHERE workspace_id = $1 AND action_taken = $2 ORDER BY processed_at DESC LIMIT $3",
                workspace_id, action, limit,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM reddit_posts WHERE workspace_id = $1 ORDER BY processed_at DESC LIMIT $2",
                workspace_id, limit,
            )
    return [dict(r) for r in rows]


@router.get("/{workspace_id}/actions")
async def list_reddit_actions(workspace_id: UUID, limit: int = Query(50, le=200)):
    async with db.get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT ra.*, rp.subreddit, rp.title as post_title
            FROM reddit_actions ra
            LEFT JOIN reddit_posts rp ON ra.post_id = rp.id
            WHERE ra.workspace_id = $1
            ORDER BY ra.performed_at DESC LIMIT $2
            """,
            workspace_id, limit,
        )
    return [dict(r) for r in rows]


@router.get("/{workspace_id}/stats")
async def reddit_stats(workspace_id: UUID):
    async with db.get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                count(*) FILTER (WHERE action_taken = 'commented') AS comments,
                count(*) FILTER (WHERE action_taken = 'dm_sent') AS dms,
                count(*) FILTER (WHERE action_taken = 'ignored') AS ignored,
                count(*) AS total_processed
            FROM reddit_posts WHERE workspace_id = $1
            """,
            workspace_id,
        )
        warm_leads = await conn.fetchval(
            "SELECT count(*) FROM leads WHERE workspace_id = $1 AND source = 'reddit'",
            workspace_id,
        )
    return {**dict(row), "warm_leads_found": warm_leads}
