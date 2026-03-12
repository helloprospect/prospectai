"""
Mock data router — returns realistic fake data for frontend prototype validation.
Remove or disable this once real data is flowing.
"""
from fastapi import APIRouter
from datetime import datetime, timezone, timedelta
import random

router = APIRouter()

WORKSPACE_ID = "mock-workspace-1"

MOCK_WORKSPACE = {
    "id": WORKSPACE_ID,
    "name": "Acme Corp Outreach",
    "owner_email": "founder@acme.com",
    "business_profile": {
        "company_name": "Acme Corp",
        "product_description": "We help SaaS companies reduce churn by 40% using AI-driven customer success automation.",
        "value_prop": "Cut churn in half with zero extra headcount.",
        "case_study": "Helped Basecamp reduce churn from 8% to 3.2% in 90 days.",
    },
    "instantly_api_key": "",
    "instantly_campaign_id": "",
    "anthropic_api_key": "",
    "status": "active",
    "created_at": "2024-01-15T10:00:00Z",
}

def _lead(i, status, score=None, variant=None, interest=0):
    names = [
        ("Sarah", "Chen", "TechFlow", "Head of Sales"),
        ("Marcus", "Weber", "DataSync", "VP Engineering"),
        ("Priya", "Sharma", "GrowthLabs", "CEO"),
        ("Tom", "Andersson", "CloudBase", "CTO"),
        ("Elena", "Kovacs", "ScaleHQ", "Founder"),
        ("James", "Murphy", "RapidStack", "Head of Growth"),
        ("Aisha", "Patel", "LeadFlow", "VP Marketing"),
        ("David", "Müller", "SoftEdge", "COO"),
        ("Nina", "Johansson", "NexGen", "Director of Ops"),
        ("Carlos", "Reyes", "PulseAI", "Head of Product"),
    ]
    first, last, company, title = names[i % len(names)]
    return {
        "id": f"lead-{i:03d}",
        "email": f"{first.lower()}.{last.lower()}@{company.lower()}.io",
        "first_name": first,
        "last_name": last,
        "company": company,
        "title": title,
        "industry": random.choice(["SaaS", "FinTech", "E-Commerce", "MarTech"]),
        "status": status,
        "total_score": score,
        "variant_type": variant,
        "interest_status": interest,
        "updated_at": (datetime.now(timezone.utc) - timedelta(hours=i)).isoformat(),
        "created_at": (datetime.now(timezone.utc) - timedelta(days=i // 3)).isoformat(),
    }


def _make_leads():
    leads = []
    i = 0
    # raw
    for _ in range(15):
        leads.append(_lead(i, "raw"))
        i += 1
    # researched
    for _ in range(10):
        leads.append(_lead(i, "researched"))
        i += 1
    # scored
    for _ in range(8):
        leads.append(_lead(i, "scored", score=random.randint(45, 90)))
        i += 1
    # personalized
    for _ in range(8):
        leads.append(_lead(i, "personalized", score=random.randint(50, 95),
                           variant=random.choice(["CHAMPION", "CHALLENGER", "EXPLORER"])))
        i += 1
    # sent — with interest_status
    statuses_sent = [0, 0, 1, -1, 2, 0, 1, -2, 3, -1, 0, 0]
    for j in range(7):
        leads.append(_lead(i, "sent", score=random.randint(55, 95),
                           variant=random.choice(["CHAMPION", "CHALLENGER", "EXPLORER"]),
                           interest=statuses_sent[j]))
        i += 1
    # replied (positive)
    for j in range(2):
        leads.append(_lead(i, "replied", score=random.randint(65, 95),
                           variant="CHAMPION", interest=random.choice([1, 2, 3])))
        i += 1
    return leads


MOCK_LEADS = _make_leads()

MOCK_PIPELINE_COUNTS = {
    "raw": 15,
    "researched": 10,
    "scored": 8,
    "personalized": 8,
    "sent": 7,
    "replied": 2,
}

MOCK_VARIANTS = [
    {
        "id": "var-champion",
        "name": "Champion v3",
        "role": "CHAMPION",
        "body_preview": "Hi {{first_name}}, I saw {{company}} recently scaled your sales team — congrats! Most companies at your stage struggle with churn eating into NRR. We helped similar teams cut churn by 40% without adding headcount…",
        "subject_preview": "{{company}}'s churn problem (quick fix)",
        "sent": 312,
        "positive": 28,
        "negative": 14,
        "positive_rate": 8.97,
        "confidence": "HIGH",
        "weight_pct": 60,
        "status": "active",
    },
    {
        "id": "var-challenger",
        "name": "Challenger v2",
        "role": "CHALLENGER",
        "body_preview": "{{first_name}} — one question: what's your current churn rate? We've found that most {{industry}} companies are leaving 20-30% NRR on the table due to reactive CS. Here's what proactive AI-driven CS looks like in practice…",
        "subject_preview": "Quick question about {{company}}'s NRR",
        "sent": 128,
        "positive": 9,
        "negative": 7,
        "positive_rate": 7.03,
        "confidence": "MEDIUM",
        "weight_pct": 25,
        "status": "active",
    },
    {
        "id": "var-explorer",
        "name": "Explorer v1",
        "role": "EXPLORER",
        "body_preview": "{{first_name}}, I analyzed {{company}}'s G2 reviews and noticed a pattern — 3 of your last 5 reviews mention 'onboarding complexity'. That's usually the first churn domino. We have a playbook for exactly this…",
        "subject_preview": "Found something interesting about {{company}}",
        "sent": 50,
        "positive": 6,
        "negative": 2,
        "positive_rate": 12.0,
        "confidence": "LOW",
        "weight_pct": 15,
        "status": "active",
    },
]

MOCK_EXPLORER_SUGGESTION = {
    "analysis": (
        "Champion (8.97%) vs Challenger (7.03%) — the data shows personalized pain-point openers "
        "outperform question-based openers. Explorer (12%) shows early promise with review-mining. "
        "Hypothesis: leads respond better when we reference specific, verifiable facts about their "
        "company rather than generic ICP pain points."
    ),
    "new_prompt": (
        "You are writing a cold email for {{first_name}} at {{company}}.\n\n"
        "APPROACH: Reference one specific, verifiable fact about {{company}} from recent news, "
        "job postings, or product reviews. Connect it directly to the churn/NRR pain point.\n\n"
        "FORMAT:\n"
        "- Line 1: Specific observation about {{company}} (1 sentence)\n"
        "- Line 2: Why that signals a churn risk (1 sentence)\n"
        "- Line 3: How we solved it for a similar company (1 sentence + metric)\n"
        "- CTA: Low-friction ask (15-minute call or reply)\n\n"
        "TONE: Direct, data-driven, no fluff. Under 80 words total.\n\n"
        "Company context: {{research_summary}}"
    ),
    "generated_at": datetime.now(timezone.utc).isoformat(),
}

MOCK_SETTINGS = {
    "workspace_id": WORKSPACE_ID,
    "business_profile": MOCK_WORKSPACE["business_profile"],
    "instantly_api_key": "",
    "instantly_campaign_id": "",
    "anthropic_api_key": "",
    "active_campaign_name": "",
}


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/workspace")
async def get_mock_workspace():
    return MOCK_WORKSPACE


@router.get("/leads")
async def get_mock_leads(status: str | None = None, limit: int = 100, offset: int = 0):
    leads = MOCK_LEADS
    if status:
        leads = [l for l in leads if l["status"] == status]
    return leads[offset:offset + limit]


@router.get("/pipeline/counts")
async def get_mock_pipeline_counts():
    return MOCK_PIPELINE_COUNTS


@router.get("/variants")
async def get_mock_variants():
    return MOCK_VARIANTS


@router.get("/explorer-suggestion")
async def get_mock_explorer_suggestion():
    return MOCK_EXPLORER_SUGGESTION


@router.get("/settings")
async def get_mock_settings():
    return MOCK_SETTINGS


@router.patch("/settings")
async def update_mock_settings(data: dict):
    MOCK_SETTINGS.update(data)
    return MOCK_SETTINGS
