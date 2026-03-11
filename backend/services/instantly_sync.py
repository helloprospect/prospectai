"""
Instantly.ai API client (v2).
- Adds leads to campaigns
- Syncs performance stats back to DB including interest_status
  (1/2/3 = positive, -1/-2/-3 = negative, 0 = no reply)
"""
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from config import settings

INSTANTLY_BASE = "https://api.instantly.ai/api/v2"


class InstantlyClient:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}"}

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
                f"{INSTANTLY_BASE}/leads",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
        return resp.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def get_campaign_analytics(self, campaign_id: str) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{INSTANTLY_BASE}/analytics/campaign/summary",
                headers=self._headers(),
                params={"campaign_id": campaign_id},
            )
            resp.raise_for_status()
        return resp.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def get_lead(self, instantly_lead_id: str) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{INSTANTLY_BASE}/leads/{instantly_lead_id}",
                headers=self._headers(),
            )
            resp.raise_for_status()
        return resp.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def list_campaign_leads(
        self,
        campaign_id: str,
        limit: int = 100,
        starting_after: str | None = None,
    ) -> dict:
        """Returns {items: [...], next_starting_after: ...}"""
        payload: dict = {"campaign_id": campaign_id, "limit": limit}
        if starting_after:
            payload["starting_after"] = starting_after
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{INSTANTLY_BASE}/leads/list",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
        return resp.json()


async def sync_performance_for_workspace(workspace_id, conn) -> int:
    """
    Pull latest stats from Instantly for a workspace and update email_performance.
    Uses v2 leads/list to get interest_status alongside basic open/reply data.
    Returns number of records synced.
    """
    workspace = await conn.fetchrow(
        "SELECT instantly_api_key, instantly_campaign_id FROM workspaces WHERE id = $1",
        workspace_id,
    )
    if not workspace or not workspace["instantly_api_key"]:
        return 0

    client = InstantlyClient(workspace["instantly_api_key"])
    campaign_id = workspace["instantly_campaign_id"]
    synced = 0

    # Get sends that need a refresh (no record yet OR older than 1 hour)
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

    # Build lookup: instantly_lead_id → send record
    send_map = {s["instantly_lead_id"]: s for s in sends}
    if not send_map:
        return 0

    # Paginate through campaign leads from Instantly v2
    starting_after = None
    while True:
        try:
            data = await client.list_campaign_leads(campaign_id, limit=100, starting_after=starting_after)
        except Exception:
            break

        items = data.get("items") or []
        if not items:
            break

        for lead_data in items:
            lead_id = lead_data.get("id") or lead_data.get("lead_id")
            send = send_map.get(lead_id)
            if send:
                await _upsert_performance(conn, workspace_id, send, lead_data)
                synced += 1

        starting_after = data.get("next_starting_after")
        if not starting_after:
            break

    return synced


async def _upsert_performance(conn, workspace_id, send: dict, instantly_data: dict):
    from datetime import datetime, timezone

    opened = bool(instantly_data.get("opened") or instantly_data.get("is_opened"))
    open_count = instantly_data.get("open_count", 1 if opened else 0)
    replied = bool(instantly_data.get("replied") or instantly_data.get("is_replied"))
    reply_text = instantly_data.get("reply_text") or instantly_data.get("last_reply") or ""
    bounced = bool(instantly_data.get("bounced") or instantly_data.get("is_bounced"))
    unsubscribed = bool(instantly_data.get("unsubscribed"))

    # v2 interest_status: 1/2/3 = positive, -1/-2/-3 = negative, 0 = no reply
    interest_status = int(
        instantly_data.get("lt_interest_status")
        or instantly_data.get("interest_status")
        or 0
    )

    if interest_status in (1, 2, 3):
        reply_sentiment = "positive"
        replied = True
    elif interest_status in (-1, -2, -3):
        reply_sentiment = "negative"
        replied = True
    elif replied and reply_text:
        reply_sentiment = _classify_reply_sentiment(reply_text)
    else:
        reply_sentiment = None

    await conn.execute(
        """
        INSERT INTO email_performance
            (workspace_id, send_id, lead_id, opened, open_count,
             replied, reply_text, instantly_interest_status, reply_sentiment,
             bounced, unsubscribed, synced_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (send_id) DO UPDATE SET
            opened = EXCLUDED.opened,
            open_count = EXCLUDED.open_count,
            replied = EXCLUDED.replied,
            reply_text = EXCLUDED.reply_text,
            instantly_interest_status = EXCLUDED.instantly_interest_status,
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
        interest_status,
        reply_sentiment,
        bounced,
        unsubscribed,
    )


def _classify_reply_sentiment(text: str) -> str:
    text_lower = text.lower()
    if any(s in text_lower for s in ["out of office", "vacation", "away", "on leave", "maternity"]):
        return "ooo"
    if any(s in text_lower for s in ["not interested", "no thanks", "remove me", "unsubscribe",
                                      "don't contact", "please stop", "wrong person"]):
        return "negative"
    if any(s in text_lower for s in ["interested", "tell me more", "let's connect", "sounds good",
                                      "can we talk", "schedule", "call", "demo", "more info"]):
        return "positive"
    return "neutral"
