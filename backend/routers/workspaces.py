from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
import db

router = APIRouter()


class WorkspaceCreate(BaseModel):
    name: str
    owner_email: str
    business_profile: dict[str, Any] = {}
    icp_config: dict[str, Any] = {}
    tone_config: dict[str, Any] = {}
    instantly_api_key: str | None = None
    instantly_campaign_id: str | None = None
    daily_lead_target: int = 50


class WorkspaceUpdate(BaseModel):
    name: str | None = None
    business_profile: dict[str, Any] | None = None
    icp_config: dict[str, Any] | None = None
    tone_config: dict[str, Any] | None = None
    instantly_api_key: str | None = None
    instantly_campaign_id: str | None = None
    daily_lead_target: int | None = None
    min_score_threshold: int | None = None
    status: str | None = None


@router.post("")
async def create_workspace(payload: WorkspaceCreate):
    import json
    async with db.get_tx() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO workspaces
                (name, owner_email, business_profile, icp_config, tone_config,
                 instantly_api_key, instantly_campaign_id, daily_lead_target)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
            """,
            payload.name,
            payload.owner_email,
            json.dumps(payload.business_profile),
            json.dumps(payload.icp_config),
            json.dumps(payload.tone_config),
            payload.instantly_api_key,
            payload.instantly_campaign_id,
            payload.daily_lead_target,
        )
        workspace_id = row["id"]

        # Seed default prompts + scoring weights from global seed_prompts
        await _seed_workspace_prompts(conn, workspace_id, payload.icp_config)

    return dict(row)


@router.get("")
async def list_workspaces():
    async with db.get_conn() as conn:
        rows = await conn.fetch("SELECT * FROM workspaces ORDER BY created_at DESC")
    return [dict(r) for r in rows]


@router.get("/{workspace_id}")
async def get_workspace(workspace_id: UUID):
    async with db.get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM workspaces WHERE id = $1", workspace_id)
    if not row:
        raise HTTPException(404, "Workspace not found")
    return dict(row)


@router.patch("/{workspace_id}")
async def update_workspace(workspace_id: UUID, payload: WorkspaceUpdate):
    import json
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.business_profile is not None:
        updates["business_profile"] = json.dumps(payload.business_profile)
    if payload.icp_config is not None:
        updates["icp_config"] = json.dumps(payload.icp_config)
    if payload.tone_config is not None:
        updates["tone_config"] = json.dumps(payload.tone_config)
    if payload.instantly_api_key is not None:
        updates["instantly_api_key"] = payload.instantly_api_key
    if payload.instantly_campaign_id is not None:
        updates["instantly_campaign_id"] = payload.instantly_campaign_id
    if payload.daily_lead_target is not None:
        updates["daily_lead_target"] = payload.daily_lead_target
    if payload.min_score_threshold is not None:
        updates["min_score_threshold"] = payload.min_score_threshold
    if payload.status is not None:
        updates["status"] = payload.status

    if not updates:
        raise HTTPException(400, "No fields to update")

    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates))
    values = list(updates.values())

    async with db.get_conn() as conn:
        row = await conn.fetchrow(
            f"UPDATE workspaces SET {set_clause} WHERE id = $1 RETURNING *",
            workspace_id, *values,
        )
    if not row:
        raise HTTPException(404, "Workspace not found")
    return dict(row)


@router.get("/{workspace_id}/stats")
async def workspace_stats(workspace_id: UUID):
    async with db.get_conn() as conn:
        leads_by_status = await conn.fetch(
            "SELECT status, count(*) FROM leads WHERE workspace_id = $1 GROUP BY status",
            workspace_id,
        )
        emails_sent = await conn.fetchval(
            "SELECT count(*) FROM email_sends WHERE workspace_id = $1", workspace_id
        )
        replies = await conn.fetchval(
            """
            SELECT count(*) FROM email_performance ep
            JOIN email_sends es ON ep.send_id = es.id
            WHERE es.workspace_id = $1 AND ep.replied = true
            """,
            workspace_id,
        )
    return {
        "leads_by_status": {r["status"]: r["count"] for r in leads_by_status},
        "emails_sent": emails_sent,
        "replies": replies,
    }


async def _seed_workspace_prompts(conn, workspace_id: UUID, icp_config: dict):
    import json
    # Determine primary industry from ICP config
    industries = icp_config.get("industries", [])
    primary_industry = industries[0] if industries else "general"

    # Try to find industry-specific seed prompts, fall back to general
    for template_type in [
        "research", "scoring",
        "body_champion", "body_challenger", "body_explorer",
        "subject_champion", "subject_challenger",
    ]:
        seed = await conn.fetchrow(
            """
            SELECT * FROM seed_prompts
            WHERE template_type = $1 AND is_active = true
            AND (industry = $2 OR industry = 'general')
            ORDER BY (industry = $2) DESC, avg_reply_rate DESC NULLS LAST
            LIMIT 1
            """,
            template_type, primary_industry,
        )
        if seed:
            await conn.execute(
                """
                INSERT INTO prompt_templates
                    (workspace_id, template_type, version, content, is_active, seeded_from, created_by)
                VALUES ($1, $2, 1, $3, true, $4, 'seed')
                """,
                workspace_id, template_type, seed["content"], seed["id"],
            )

    # Create default scoring weights
    await conn.execute(
        """
        INSERT INTO scoring_weights (workspace_id, version, is_active)
        VALUES ($1, 1, true)
        """,
        workspace_id,
    )
