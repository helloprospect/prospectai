"""
SearchLeads API client.
Docs: https://searchleads.dev/api
Cheaper than Apollo, includes email verification.
"""
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from config import settings


BASE_URL = "https://api.searchleads.dev/v1"


class SearchLeadsClient:
    def __init__(self, api_key: str = settings.SEARCHLEADS_API_KEY):
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def search_people(
        self,
        industries: list[str] | None = None,
        titles: list[str] | None = None,
        company_sizes: list[str] | None = None,
        geographies: list[str] | None = None,
        limit: int = 50,
        page: int = 1,
    ) -> list[dict]:
        payload = {
            "limit": limit,
            "page": page,
        }
        if industries:
            payload["industry"] = industries
        if titles:
            payload["job_title"] = titles
        if company_sizes:
            payload["employee_count"] = _convert_sizes(company_sizes)
        if geographies:
            payload["country"] = geographies

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{BASE_URL}/people/search",
                headers=self.headers,
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        return _normalize_people(data.get("data", []) or data.get("results", []))

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def verify_email(self, email: str) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{BASE_URL}/email/verify",
                headers=self.headers,
                params={"email": email},
            )
            resp.raise_for_status()
        return resp.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def find_email(self, first_name: str, last_name: str, company: str) -> dict | None:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{BASE_URL}/email/find",
                headers=self.headers,
                params={
                    "first_name": first_name,
                    "last_name": last_name,
                    "company": company,
                },
            )
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
        return resp.json()


def _convert_sizes(sizes: list[str]) -> list[str]:
    """Convert human-readable sizes to SearchLeads API format."""
    size_map = {
        "1-10": "1-10",
        "10-50": "11-50",
        "50-200": "51-200",
        "200-500": "201-500",
        "500-1000": "501-1000",
        "1000+": "1001+",
    }
    return [size_map.get(s, s) for s in sizes]


def _normalize_people(raw: list[dict]) -> list[dict]:
    """Normalize SearchLeads response to our internal lead format."""
    normalized = []
    for p in raw:
        # SearchLeads field names may vary — adapt to actual API response
        email = p.get("email") or p.get("work_email") or p.get("email_address")
        if not email:
            continue
        normalized.append({
            "email": email.lower().strip(),
            "first_name": p.get("first_name") or p.get("firstName", ""),
            "last_name": p.get("last_name") or p.get("lastName", ""),
            "company": p.get("company") or p.get("organization") or p.get("company_name", ""),
            "title": p.get("title") or p.get("job_title", ""),
            "linkedin_url": p.get("linkedin_url") or p.get("linkedin", ""),
            "website": p.get("website") or p.get("company_website", ""),
            "industry": p.get("industry", ""),
            "company_size": p.get("company_size") or p.get("employee_count", ""),
            "location": p.get("location") or p.get("country", ""),
            "source": "searchleads",
            "source_raw": p,
        })
    return normalized
