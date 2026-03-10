from uuid import UUID
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import db

router = APIRouter()


@router.get("/{workspace_id}")
async def list_leads(
    workspace_id: UUID,
    status: str | None = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0),
):
    async with db.get_conn() as conn:
        if status:
            rows = await conn.fetch(
                """
                SELECT l.*, ls.total_score
                FROM leads l
                LEFT JOIN lead_scores ls ON ls.lead_id = l.id
                WHERE l.workspace_id = $1 AND l.status = $2
                ORDER BY l.created_at DESC
                LIMIT $3 OFFSET $4
                """,
                workspace_id, status, limit, offset,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT l.*, ls.total_score
                FROM leads l
                LEFT JOIN lead_scores ls ON ls.lead_id = l.id
                WHERE l.workspace_id = $1
                ORDER BY l.created_at DESC
                LIMIT $2 OFFSET $3
                """,
                workspace_id, limit, offset,
            )
    return [dict(r) for r in rows]


@router.get("/{workspace_id}/{lead_id}")
async def get_lead(workspace_id: UUID, lead_id: UUID):
    async with db.get_conn() as conn:
        lead = await conn.fetchrow(
            "SELECT * FROM leads WHERE id = $1 AND workspace_id = $2",
            lead_id, workspace_id,
        )
        if not lead:
            raise HTTPException(404, "Lead not found")

        research = await conn.fetchrow(
            "SELECT * FROM lead_research WHERE lead_id = $1", lead_id
        )
        score = await conn.fetchrow(
            "SELECT * FROM lead_scores WHERE lead_id = $1 ORDER BY scored_at DESC LIMIT 1",
            lead_id,
        )
        variants = await conn.fetchrow(
            "SELECT * FROM email_variants WHERE lead_id = $1", lead_id
        )
        send = await conn.fetchrow(
            "SELECT * FROM email_sends WHERE lead_id = $1 ORDER BY sent_at DESC LIMIT 1",
            lead_id,
        )
        perf = await conn.fetchrow(
            """
            SELECT ep.* FROM email_performance ep
            JOIN email_sends es ON ep.send_id = es.id
            WHERE es.lead_id = $1
            ORDER BY ep.synced_at DESC LIMIT 1
            """,
            lead_id,
        )

    return {
        "lead": dict(lead),
        "research": dict(research) if research else None,
        "score": dict(score) if score else None,
        "variants": dict(variants) if variants else None,
        "send": dict(send) if send else None,
        "performance": dict(perf) if perf else None,
    }


@router.get("/{workspace_id}/pipeline/counts")
async def pipeline_counts(workspace_id: UUID):
    async with db.get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT status, count(*) as count
            FROM leads WHERE workspace_id = $1
            GROUP BY status ORDER BY status
            """,
            workspace_id,
        )
    return {r["status"]: r["count"] for r in rows}
