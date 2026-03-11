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
) -> tuple[dict, int]:
    """Run the research prompt for a single lead."""
    filled = _fill_template(prompt_template, {
        "company": lead.get("company", ""),
        "website": lead.get("website", ""),
        "first_name": lead.get("first_name", ""),
        "last_name": lead.get("last_name", ""),
        "title": lead.get("title", ""),
        "linkedin_url": lead.get("linkedin_url", ""),
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
) -> tuple[dict, int]:
    filled = _fill_template(prompt_template, {
        "first_name": lead.get("first_name", ""),
        "last_name": lead.get("last_name", ""),
        "title": lead.get("title", ""),
        "company": lead.get("company", ""),
        "industry": lead.get("industry", ""),
        "company_size": lead.get("company_size", ""),
        "location": lead.get("location", ""),
        "research_json": json.dumps(research, indent=2),
        "icp_industries": ", ".join(icp_config.get("industries", [])),
        "icp_sizes": ", ".join(icp_config.get("company_sizes", [])),
        "icp_titles": ", ".join(icp_config.get("titles", [])),
        "weights_json": json.dumps(weights, indent=2),
    })
    system = (
        "You are a lead scoring system. Return valid JSON only. "
        "Be strict: reserve 70+ scores for leads with clear buying signals AND strong ICP fit."
    )
    return await complete_json(system, filled, max_tokens=800)


async def personalize_email(
    body_template: str,
    subject_template: str,
    lead: dict,
    research: dict,
    score: dict,
    workspace: dict,
) -> tuple[dict, int]:
    """Generate one personalized email using the pre-selected body + subject templates.
    Returns {"body_text": "...", "subject_text": "..."}, tokens.
    """
    research_summary = _research_summary(research)
    context = {
        "first_name": lead.get("first_name", ""),
        "last_name": lead.get("last_name", ""),
        "title": lead.get("title", ""),
        "company": lead.get("company", ""),
        "industry": lead.get("industry", ""),
        "primary_angle": score.get("primary_angle", ""),
        "research_summary": research_summary,
        "sender_company": workspace.get("business_profile", {}).get("company_name", ""),
        "product_description": workspace.get("business_profile", {}).get("product_description", ""),
        "value_prop": workspace.get("business_profile", {}).get("value_prop", ""),
    }

    prompt = f"""Write one cold email for this lead. Return JSON with keys: body_text, subject_text.

=== BODY INSTRUCTIONS ===
{_fill_template(body_template, context)}

=== SUBJECT LINE INSTRUCTIONS ===
{_fill_template(subject_template, context)}

Return ONLY this JSON structure:
{{
  "body_text": "...",
  "subject_text": "..."
}}"""

    system = (
        "You write high-converting cold emails. Return valid JSON only. "
        "Follow the instructions exactly. Keep emails concise and personal."
    )
    return await complete_json(system, prompt, max_tokens=1200)


async def generate_explorer_prompt(
    performance_data: list[dict],
    current_champion: str,
    variant_axis: str,
    workspace: dict,
) -> tuple[str, int]:
    """Generate a new Explorer prompt that tests ONE hypothesis.

    variant_axis: 'body' or 'subject'
    performance_data: list of {template_type, reply_rate, positive_count, negative_count, sent_count,
                                positive_examples, negative_examples}
    Returns (new_prompt_text, tokens) — plain prompt text, no JSON wrapper.
    """
    profile = workspace.get("business_profile", {})
    tone = workspace.get("tone_config", {})

    variants_text = ""
    for v in performance_data:
        rate = f"{v.get('reply_rate', 0):.1%}"
        sent = v.get("sent_count", 0)
        pos = v.get("positive_count", 0)
        neg = v.get("negative_count", 0)
        no_reply = sent - pos - neg
        variants_text += f"\n### {v['template_type']}\nGesendet: {sent} | Positiv: {pos} ({rate}) | Negativ: {neg} | Keine Reaktion: {no_reply}\n"

        if v.get("positive_examples"):
            variants_text += "Erfolgreiche Beispiele:\n"
            for ex in v["positive_examples"][:3]:
                variants_text += f'  - Subject: "{ex.get("subject","")}" | Icebreaker: "{ex.get("icebreaker","")[:120]}"\n'

        if v.get("negative_examples"):
            variants_text += "Abgelehnte Beispiele:\n"
            for ex in v["negative_examples"][:2]:
                variants_text += f'  - Subject: "{ex.get("subject","")}" | Icebreaker: "{ex.get("icebreaker","")[:120]}"\n'

    prompt = f"""Du bist Cold-Email-Experte.

## Kontext
Produkt: {profile.get("product_description", "")}
Value Prop: {profile.get("value_prop", "")}
Ton: {tone.get("style", "professional")}

## Performance-Daten ({variant_axis.upper()} VARIANTEN)
{variants_text}

## Aktueller Champion-Prompt
{current_champion}

## Aufgabe
1. Analysiere WARUM der Champion funktioniert (Ton, Einstieg, Referenz, Länge, CTA).
2. Erkläre WARUM andere versagen.
3. Generiere einen neuen Explorer-Prompt der NUR EINEN Aspekt ändert und eine konkrete Hypothese testet.

Der Explorer-Prompt muss:
- Ein vollständiger Prompt-Text sein (direkt verwendbar wie der Champion-Prompt oben)
- Dieselben Template-Variablen nutzen: {{{{first_name}}}}, {{{{company}}}}, {{{{title}}}}, {{{{research_summary}}}}, {{{{value_prop}}}}
- GENAU EINE Sache anders machen als der Champion (z.B. nur den CTA, oder nur den Einstieg)

Antworte in diesem Format:
ANALYSE: [2-3 Sätze warum Champion funktioniert]
HYPOTHESE: [Was der Explorer testet]
PROMPT:
[Vollständiger neuer Explorer-Prompt-Text]"""

    system = (
        "You are a cold email optimization expert. Analyze data and write one new exploration prompt. "
        "Output format: ANALYSE: ... HYPOTHESE: ... PROMPT: [full prompt text]"
    )
    text, tokens = await complete(system, prompt, max_tokens=2000, temperature=0.7)

    # Extract just the PROMPT section
    if "PROMPT:" in text:
        new_prompt = text.split("PROMPT:", 1)[1].strip()
    else:
        # Fallback: return the full text as the prompt
        new_prompt = text.strip()

    return new_prompt, tokens


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

def _fill_template(template: str, context: dict) -> str:
    result = template
    for key, value in context.items():
        result = result.replace(f"{{{{{key}}}}}", str(value) if value else "")
    return result


def _research_summary(research: dict) -> str:
    parts = []
    if research.get("company_summary"):
        parts.append(research["company_summary"])
    if research.get("buying_signals"):
        parts.append("Signals: " + "; ".join(research["buying_signals"][:3]))
    if research.get("recent_news"):
        parts.append("News: " + research["recent_news"][:200])
    return " | ".join(parts)
