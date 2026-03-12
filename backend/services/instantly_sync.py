"""
Instantly.ai v2 API client.
- Bearer token auth: Authorization: Bearer {api_key}
- Base URL: https://api.instantly.ai/api/v2/
- Primary signal: interest_status (1/2/3=positive, -1/-2/-3=negative, 0=neutral)
"""
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

INSTANTLY_BASE = "https://api.instantly.ai/api/v2"


class InstantlyClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def list_campaigns(self) -> list[dict]:
        """List all campaigns. Returns [{id, name, status, ...}]"""
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{INSTANTLY_BASE}/campaigns",
                headers=self.headers,
                params={"limit": 100},
            )
            resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            return data
        return data.get("items", data.get("data", []))

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def add_lead_to_campaign(
        self,
        campaign_id: str,
        email: str,
        first_name: str,
        last_name: str,
        company: str,
        custom_variables: dict | None = None,
    ) -> dict:
        """Add a lead to a campaign with custom variables for CCC email body/subject."""
        payload = {
            "campaign_id": campaign_id,
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "company_name": company,
        }
        if custom_variables:
            payload["variables"] = custom_variables

        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{INSTANTLY_BASE}/leads",
                headers=self.headers,
                json=payload,
            )
            resp.raise_for_status()
        return resp.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def get_leads_batch(
        self, campaign_id: str, limit: int = 100, starting_after: str | None = None
    ) -> list[dict]:
        """
        Fetch leads for a campaign with interest_status.
        Returns [{email, interest_status, ...}]
        """
        payload: dict = {"campaign_id": campaign_id, "limit": limit}
        if starting_after:
            payload["starting_after"] = starting_after

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{INSTANTLY_BASE}/leads/list",
                headers=self.headers,
                json=payload,
            )
            resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            return data
        return data.get("items", data.get("data", []))


async def sync_performance_for_workspace(workspace_id, conn) -> int:
    """
    Pull latest interest_status from Instantly v2 for a workspace.
    Updates email_performance.interest_status.
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
    if not campaign_id:
        return 0

    synced = 0
    starting_after = None

    while True:
        leads = await client.get_leads_batch(campaign_id, limit=100, starting_after=starting_after)
        if not leads:
            break

        for lead_data in leads:
            email = lead_data.get("email")
            interest_status = lead_data.get("interest_status", 0)
            if not email:
                continue

            # Find send record by email + workspace
            send = await conn.fetchrow(
                """
                SELECT es.id, es.lead_id FROM email_sends es
                JOIN leads l ON l.id = es.lead_id
                WHERE es.workspace_id = $1 AND l.email = $2
                ORDER BY es.sent_at DESC LIMIT 1
                """,
                workspace_id,
                email,
            )
            if not send:
                continue

            await conn.execute(
                """
                INSERT INTO email_performance
                    (workspace_id, send_id, lead_id, interest_status, synced_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (send_id) DO UPDATE SET
                    interest_status = EXCLUDED.interest_status,
                    synced_at = NOW()
                """,
                workspace_id,
                send["id"],
                send["lead_id"],
                interest_status,
            )
            synced += 1

        # Pagination
        if len(leads) < 100:
            break
        starting_after = leads[-1].get("id") or leads[-1].get("email")

    return synced
