"""
Instantly.ai API client.
- Adds leads to campaigns
- Syncs performance stats back to DB
"""
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from config import settings

INSTANTLY_BASE = "https://api.instantly.ai/api/v1"


class InstantlyClient:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def _params(self, extra: dict | None = None) -> dict:
        p = {"api_key": self.api_key}
        if extra:
            p.update(extra)
        return p

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def add_lead(
        self,
        campaign_id: str,
        email: str,
        first_name: str,
        last_name: str,
        company: str,
        custom_variables: dict | None = None,
    ) -> dict:
        payload = {
            "campaign_id": campaign_id,
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "company_name": company,
        }
        if custom_variables:
            payload["custom_variables"] = custom_variables

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{INSTANTLY_BASE}/lead/add",
                params={"api_key": self.api_key},
                json=payload,
            )
            resp.raise_for_status()
        return resp.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def get_campaign_analytics(self, campaign_id: str) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{INSTANTLY_BASE}/analytics/campaign/summary",
                params=self._params({"campaign_id": campaign_id}),
            )
            resp.raise_for_status()
        return resp.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def get_lead_status(self, instantly_lead_id: str) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{INSTANTLY_BASE}/lead",
                params=self._params({"id": instantly_lead_id}),
            )
            resp.raise_for_status()
        return resp.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def get_replies(self, campaign_id: str, limit: int = 100, skip: int = 0) -> list[dict]:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{INSTANTLY_BASE}/reply/list",
                params=self._params({
                    "campaign_id": campaign_id,
                    "limit": limit,
                    "skip": skip,
                }),
            )
            resp.raise_for_status()
        return resp.json().get("data", [])


async def sync_performance_for_workspace(workspace_id, conn) -> int:
    """
    Pull latest stats from Instantly for a workspace and update email_performance.
    Returns number of records synced.
    """
    workspace = await conn.fetchrow(
        "SELECT instantly_api_key, instantly_campaign_id FROM workspaces WHERE id = $1",
        workspace_id,
    )
    if not workspace or not workspace["instantly_api_key"]:
        return 0

    client = InstantlyClient(workspace["instantly_api_key"])
    synced = 0

    # Get all sends that haven't been synced yet or need refresh
    sends = await conn.fetch(
        """
        SELECT es.id, es.instantly_lead_id, es.lead_id
        FROM email_sends es
        LEFT JOIN email_performance ep ON ep.send_id = es.id
        WHERE es.workspace_id = $1
          AND es.instantly_lead_id IS NOT NULL
          AND (ep.synced_at IS NULL OR ep.synced_at < NOW() - interval '1 hour')
        LIMIT 200
        """,
        workspace_id,
    )

    for send in sends:
        try:
            data = await client.get_lead_status(send["instantly_lead_id"])
            await _upsert_performance(conn, workspace_id, send, data)
            synced += 1
        except Exception:
            continue

    return synced


async def _upsert_performance(conn, workspace_id, send: dict, instantly_data: dict):
    from datetime import datetime, timezone
    import json

    opened = instantly_data.get("opened", False) or instantly_data.get("is_opened", False)
    open_count = instantly_data.get("open_count", 1 if opened else 0)
    replied = instantly_data.get("replied", False) or instantly_data.get("is_replied", False)
    reply_text = instantly_data.get("reply_text") or instantly_data.get("last_reply", "")
    bounced = instantly_data.get("bounced", False) or instantly_data.get("is_bounced", False)
    unsubscribed = instantly_data.get("unsubscribed", False)

    # Simple sentiment classification
    reply_sentiment = None
    if replied and reply_text:
        reply_sentiment = _classify_reply_sentiment(reply_text)

    await conn.execute(
        """
        INSERT INTO email_performance
            (workspace_id, send_id, lead_id, opened, open_count,
             replied, reply_text, reply_sentiment, bounced, unsubscribed, synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (send_id) DO UPDATE SET
            opened = EXCLUDED.opened,
            open_count = EXCLUDED.open_count,
            replied = EXCLUDED.replied,
            reply_text = EXCLUDED.reply_text,
            reply_sentiment = EXCLUDED.reply_sentiment,
            bounced = EXCLUDED.bounced,
            unsubscribed = EXCLUDED.unsubscribed,
            synced_at = NOW()
        """,
        workspace_id,
        send["id"],
        send["lead_id"],
        opened,
        open_count,
        replied,
        reply_text,
        reply_sentiment,
        bounced,
        unsubscribed,
    )


def _classify_reply_sentiment(text: str) -> str:
    text_lower = text.lower()
    negative_signals = [
        "not interested", "no thanks", "remove me", "unsubscribe",
        "don't contact", "please stop", "wrong person", "not relevant",
    ]
    positive_signals = [
        "interested", "tell me more", "let's connect", "sounds good",
        "can we talk", "schedule", "call", "demo", "more info",
    ]
    ooo_signals = ["out of office", "vacation", "away", "on leave", "maternity"]

    if any(s in text_lower for s in ooo_signals):
        return "ooo"
    if any(s in text_lower for s in negative_signals):
        return "negative"
    if any(s in text_lower for s in positive_signals):
        return "positive"
    return "neutral"
