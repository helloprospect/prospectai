"""
Claude API wrapper.
All calls go through this module to centralize model, error handling, and token logging.
"""
import json
import re
from typing import Any
import anthropic
from tenacity import retry, stop_after_attempt, wait_exponential
from config import settings

_client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
MODEL = settings.CLAUDE_MODEL


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=30))
async def complete(
    system: str,
    user: str,
    max_tokens: int = 2048,
    temperature: float = 0.3,
) -> tuple[str, int]:
    """Returns (response_text, total_tokens_used)."""
    response = await _client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        temperature=temperature,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    text = response.content[0].text
    tokens = response.usage.input_tokens + response.usage.output_tokens
    return text, tokens


async def complete_json(
    system: str,
    user: str,
    max_tokens: int = 2048,
) -> tuple[dict | list, int]:
    """
    Like complete() but parses the response as JSON.
    Strips markdown code fences if Claude wraps the output.
    """
    text, tokens = await complete(system, user, max_tokens=max_tokens)
    return parse_json(text), tokens


def parse_json(text: str) -> dict | list:
    """Extract JSON from Claude's response, tolerating code fences."""
    text = text.strip()
    # Strip ```json ... ``` or ``` ... ```
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


# ============================================================
# Domain-specific helpers
# ============================================================

async def research_lead(
    prompt_template: str,
    lead: dict,
    workspace: dict | None = None,
) -> tuple[dict, int]:
    """Run the research prompt for a single lead."""
    bp = (workspace or {}).get("business_profile") or {}
    icp = (workspace or {}).get("icp_config") or {}
    filled = _fill_template(prompt_template, {
        # Lead-specific
        "first_name": lead.get("first_name", ""),
        "last_name": lead.get("last_name", ""),
        "title": lead.get("title", ""),
        "company_name": lead.get("company", ""),
        "company": lead.get("company", ""),  # backward compat
        "website": lead.get("website", ""),
        "website_url": lead.get("website", ""),
        "linkedin_url": lead.get("linkedin_url", ""),
        "industry": lead.get("industry", ""),
        "country": lead.get("country", lead.get("location", "")),
        "city": lead.get("city", ""),
        # Sender / workspace context
        "sender_company_name": bp.get("company_name", ""),
        "sender_description": bp.get("product_description", ""),
        "sender_role": bp.get("role_description", f"You are a founder at {bp.get('company_name', 'your company')}."),
        "sender_icp": bp.get("icp_description") or _format_icp(icp),
        "case_study": bp.get("case_study", ""),
        "value_prop": bp.get("value_prop", ""),
    })
    system = (
        "You are a precise B2B sales researcher. Always return valid JSON only, "
        "no prose, no markdown fences."
    )
    return await complete_json(system, filled, max_tokens=1500)


async def score_lead(
    prompt_template: str,
    lead: dict,
    research: dict,
    weights: dict,
    icp_config: dict,
    workspace: dict | None = None,
) -> tuple[dict, int]:
    bp = (workspace or {}).get("business_profile") or {}
    filled = _fill_template(prompt_template, {
        # Lead fields
        "first_name": lead.get("first_name", ""),
        "last_name": lead.get("last_name", ""),
        "title": lead.get("title", ""),
        "company_name": lead.get("company", ""),
        "company": lead.get("company", ""),
        "industry": lead.get("industry", ""),
        "company_size": lead.get("company_size", ""),
        "location": lead.get("location", ""),
        "country": lead.get("country", lead.get("location", "")),
        # Research
        "research_json": json.dumps(research, indent=2),
        "research_result": _format_research_text(research, {}),
        # ICP
        "icp_industries": ", ".join(icp_config.get("industries", [])),
        "icp_sizes": ", ".join(icp_config.get("company_sizes", [])),
        "icp_titles": ", ".join(icp_config.get("titles", [])),
        "weights_json": json.dumps(weights, indent=2),
        # Sender context
        "sender_company_name": bp.get("company_name", ""),
        "sender_description": bp.get("product_description", ""),
        "sender_icp": bp.get("icp_description") or _format_icp(icp_config),
    })
    system = (
        "You are a lead scoring system. Return valid JSON only. "
        "Be strict: reserve 70+ scores for leads with clear buying signals AND strong ICP fit."
    )
    return await complete_json(system, filled, max_tokens=800)


async def generate_ccc_variants(
    body_champion_template: str,
    body_challenger_template: str,
    body_explorer_template: str,
    subject_champion_template: str,
    subject_challenger_template: str,
    lead: dict,
    research: dict,
    score: dict,
    workspace: dict,
) -> tuple[dict, int]:
    """
    Generate Champion / Challenger / Explorer email variants in one API call.
    Returns dict with keys: body_champion, body_challenger, body_explorer,
                            subject_champion, subject_challenger, subject_explorer
    """
    bp = workspace.get("business_profile") or {}
    research_text = _format_research_text(research, score)
    country = lead.get("country", lead.get("location", ""))
    language_rule = "dutch" if any(c in country.lower() for c in ["netherlands", "belgium", "nederland", "belgique", "belgie"]) else "english"

    context = {
        # Lead data
        "first_name": lead.get("first_name", ""),
        "last_name": lead.get("last_name", ""),
        "title": lead.get("title", ""),
        "company_name": lead.get("company", ""),
        "industry": lead.get("industry", ""),
        "country": country,
        "city": lead.get("city", ""),
        "website_url": lead.get("website", ""),
        "linkedin_url": lead.get("linkedin_url", ""),
        # Research + scoring
        "research_result": research_text,
        "primary_angle": score.get("primary_angle", ""),
        "tier": score.get("tier", "TIER2"),
        # Workspace / sender context
        "sender_company_name": bp.get("company_name", ""),
        "sender_role": bp.get("role_description", f"You are a founder at {bp.get('company_name', 'our company')}."),
        "sender_description": bp.get("product_description", ""),
        "sender_icp": bp.get("icp_description", ""),
        "case_study": bp.get("case_study", ""),
        "value_prop": bp.get("value_prop", ""),
        "language_rule": language_rule,
    }

    def _fill(template: str) -> str:
        return _fill_template(template, context)

    combined_prompt = f"""Generate 6 email variants for this lead following the exact instructions for each section.
Return ONLY valid JSON with these keys: body_champion, body_challenger, body_explorer, subject_champion, subject_challenger, subject_explorer.

=== BODY CHAMPION (peer-to-peer, story-driven, 50-80 words) ===
{_fill(body_champion_template)}

=== BODY CHALLENGER (direct/confident Gordon Gekko style, 70-100 words) ===
{_fill(body_challenger_template)}

=== BODY EXPLORER (ultra-short hypothesis test, 40-60 words) ===
{_fill(body_explorer_template)}

=== SUBJECT CHAMPION (keyword juxtaposition style, 2-8 words) ===
{_fill(subject_champion_template)}
Note: Generate the subject based on BODY CHAMPION above.

=== SUBJECT CHALLENGER (2-noun combo style, 2-6 words) ===
{_fill(subject_challenger_template)}
Note: Generate the subject based on BODY CHALLENGER above.

Return ONLY this JSON, no other text:
{{
  "body_champion": "...",
  "body_challenger": "...",
  "body_explorer": "...",
  "subject_champion": "...",
  "subject_challenger": "...",
  "subject_explorer": "..."
}}

For subject_explorer: create a 2-5 word subject that matches the body_explorer angle. Same language rule as others."""

    system = (
        "You write high-converting cold emails. Return valid JSON only. "
        "Each variant MUST be distinct — different tone, angle, or length. "
        "Follow each section's instructions precisely."
    )
    return await complete_json(system, combined_prompt, max_tokens=3000)


async def classify_reddit_post(posts: list[dict]) -> tuple[list[dict], int]:
    """Classify a batch of Reddit posts. Returns list of {post_id, relevance, intent, action}."""
    posts_text = "\n\n".join(
        f"POST {i+1} (id: {p['reddit_post_id']}):\nTitle: {p['title']}\nBody: {p.get('body', '')[:500]}"
        for i, p in enumerate(posts)
    )
    prompt = f"""Classify each Reddit post for B2B cold email/outreach relevance.

{posts_text}

For each post, return:
- relevance: 0-10 (how relevant is this to someone who needs outreach/leads/cold email help)
- intent: "high" | "medium" | "low"
- action: "comment" (helpful reply, relevance >= 7) | "dm" (direct message, relevance >= 8, explicit ask) | "ignore"

Return JSON array:
[
  {{"post_id": "...", "relevance": 7, "intent": "medium", "action": "comment"}},
  ...
]"""

    system = (
        "You classify Reddit posts for GTM relevance. Be strict. "
        "Only score 8+ for posts where someone is explicitly asking for help with sales/outreach. "
        "Return valid JSON array only."
    )
    return await complete_json(system, prompt, max_tokens=1000)


async def write_reddit_comment(post: dict, workspace: dict) -> tuple[str, int]:
    prompt = f"""Write a helpful Reddit comment (NOT salesy) for this post.

Post title: {post['title']}
Post body: {post.get('body', '')[:800]}
Subreddit: r/{post['subreddit']}

Our product: {workspace.get('business_profile', {}).get('product_description', '')}

Rules:
- Be genuinely helpful first
- Share a specific insight, not generic advice
- Mention our product/service only if directly relevant and naturally fits (max 1 sentence)
- Tone: peer-to-peer, not a sales pitch
- Length: 3-6 sentences

Write ONLY the comment text."""
    system = "You write authentic, helpful Reddit comments. Never sound like a salesperson."
    text, tokens = await complete(system, prompt, max_tokens=400, temperature=0.7)
    return text.strip(), tokens


async def write_reddit_dm(post: dict, workspace: dict) -> tuple[str, int]:
    prompt = f"""Write a personalized Reddit DM to the author of this post.

Post title: {post['title']}
Post body: {post.get('body', '')[:600]}
Author: u/{post['author']}

Our product: {workspace.get('business_profile', {}).get('product_description', '')}
Value prop: {workspace.get('business_profile', {}).get('value_prop', '')}

Rules:
- Reference their specific post/situation
- Offer genuine value or a specific insight
- Soft mention of what we do — not a hard pitch
- End with a low-commitment CTA (happy to share more, link to site)
- Length: 4-6 sentences, conversational

Write ONLY the DM text."""
    system = "You write personalized Reddit DMs that feel genuine, not automated."
    text, tokens = await complete(system, prompt, max_tokens=400, temperature=0.7)
    return text.strip(), tokens


async def run_optimization_analysis(
    performance_report: str,
    current_prompts: dict[str, str],
    current_weights: dict,
    benchmark: dict,
) -> tuple[dict, int]:
    prompts_text = "\n\n".join(
        f"=== {k.upper()} PROMPT ===\n{v}" for k, v in current_prompts.items()
    )
    prompt = f"""You are an expert cold email campaign optimizer. Analyze performance data and recommend improvements.

{performance_report}

BENCHMARK FOR THIS INDUSTRY:
Average open rate: {benchmark.get('avg_open_rate', 'N/A')}
Average reply rate: {benchmark.get('avg_reply_rate', 'N/A')}
Top 10% reply rate: {benchmark.get('top_decile_reply_rate', 'N/A')}

CURRENT ACTIVE PROMPTS:
{prompts_text}

CURRENT SCORING WEIGHTS:
{json.dumps(current_weights, indent=2)}

Analyze and return a JSON object:
{{
  "analysis": "2-3 paragraph analysis of what's working and what isn't",
  "prompt_changes": [
    {{
      "template_type": "body_challenger",
      "new_content": "full rewritten prompt text",
      "rationale": "why this change"
    }}
  ],
  "weight_changes": {{
    "icp_industry": 0.18,
    "icp_size": 0.10,
    "rationale": "why these weight changes"
  }},
  "threshold_recommendation": 50,
  "confidence": 0.75
}}

Only include prompt_changes for prompts that clearly need improvement.
Only change weights that have strong data support.
confidence: 0-1, where 1 = very confident in recommendations.
If insufficient data, return empty arrays and low confidence."""

    system = (
        "You are a cold email optimization expert. Analyze data rigorously. "
        "Only recommend changes supported by the data. Return valid JSON only."
    )
    return await complete_json(system, prompt, max_tokens=3000)


# ============================================================
# Helpers
# ============================================================

def _format_icp(icp: dict) -> str:
    """Build a readable ICP description from the icp_config dict."""
    parts = []
    if icp.get("industries"):
        parts.append("Industries: " + ", ".join(icp["industries"]))
    if icp.get("titles"):
        parts.append("Target titles: " + ", ".join(icp["titles"][:6]))
    if icp.get("company_sizes"):
        parts.append("Company sizes: " + ", ".join(icp["company_sizes"]))
    if icp.get("geographies"):
        parts.append("Countries: " + ", ".join(icp["geographies"]))
    return " | ".join(parts) if parts else "B2B companies"


def _fill_template(template: str, context: dict) -> str:
    result = template
    for key, value in context.items():
        result = result.replace(f"{{{{{key}}}}}", str(value) if value else "")
    return result


def _format_research_text(research: dict, score: dict) -> str:
    """
    Format research JSON + score into structured text matching the prompt's {{research_result}} variable.
    Handles both:
    - Old format: research JSON from research_lead() + separate score dict
    - New format: research step returns structured text directly (stored in company_summary)
    """
    # If research already contains structured text (new pipeline), return it directly
    raw_text = research.get("raw_research_text") or research.get("research_text")
    if raw_text:
        return raw_text

    # Build structured text from JSON fields (backward compat)
    parts = []
    if research.get("company_summary"):
        parts.append(f"COMPANY: {research['company_summary']}")
    if research.get("recent_news") and research["recent_news"] != "None found":
        parts.append(f"NEWS: {research['recent_news']}")
    if research.get("buying_signals"):
        signals = research["buying_signals"]
        if isinstance(signals, list):
            parts.append("SIGNALS: " + "; ".join(signals[:4]))
    if research.get("tech_stack"):
        stack = research["tech_stack"]
        if isinstance(stack, list):
            parts.append("TECH: " + ", ".join(stack[:6]))
    if research.get("decision_maker_bio"):
        parts.append(f"PERSON: {research['decision_maker_bio']}")
    if research.get("linkedin_activity") and research["linkedin_activity"] != "No data":
        parts.append(f"LINKEDIN: {research['linkedin_activity']}")
    if score.get("tier"):
        parts.append(f"TIER: {score['tier']}")
    if score.get("reasoning"):
        parts.append(f"SCORING REASON: {score['reasoning']}")

    return "\n".join(parts) if parts else "No research data available."
