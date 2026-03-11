-- Seed Prompts — Champion / Challenger / Explorer framework
-- template_type: 'research' | 'scoring'
--   | 'body_champion' | 'body_challenger' | 'body_explorer'
--   | 'subject_champion' | 'subject_challenger' | 'subject_explorer'
--
-- Champion (60% traffic): best-performing, keeps running
-- Challenger (25%): second-best, keeps pressure on champion
-- Explorer (15%): tests ONE new hypothesis — replaced by optimizer when it hits 50 samples

-- ============================================================
-- RESEARCH PROMPTS
-- ============================================================

INSERT INTO seed_prompts (industry, template_type, content, avg_reply_rate, sample_size, notes)
VALUES (
    'general',
    'research',
    $PROMPT$You are a B2B sales researcher. Given the following company and contact information, research and return a structured JSON analysis.

Company: {{company}}
Website: {{website}}
Contact: {{first_name}} {{last_name}}, {{title}}
LinkedIn: {{linkedin_url}}

Return a JSON object with these exact fields:
{
  "company_summary": "2-3 sentence summary of what the company does and their business model",
  "recent_news": "Any notable news, funding, product launches, expansions, or changes in the last 6 months. Write 'None found' if nothing relevant.",
  "tech_stack": ["list", "of", "technologies", "they", "use"],
  "pain_points": ["specific", "business", "challenges", "this", "company", "likely", "faces"],
  "buying_signals": ["specific", "signals", "that", "suggest", "they", "might", "need", "outreach", "services"],
  "decision_maker_bio": "Brief background on {{first_name}} {{last_name}} — role, tenure, background, any public posts or content",
  "linkedin_activity": "Summary of their recent LinkedIn activity or content if available. Write 'No data' if not found.",
  "custom_insights": {}
}

Focus on specificity. Generic observations are useless. Find the angle that makes this company different from 1000 others in their space.$PROMPT$,
    NULL, 0, 'General research prompt — works across industries'
),
(
    'saas',
    'research',
    $PROMPT$You are a B2B sales researcher specializing in SaaS companies. Research the following contact and return structured JSON.

Company: {{company}}
Website: {{website}}
Contact: {{first_name}} {{last_name}}, {{title}}
LinkedIn: {{linkedin_url}}

Return JSON:
{
  "company_summary": "What the SaaS does, target market, pricing model if known, stage (startup/scale-up/enterprise)",
  "recent_news": "Funding rounds, product launches, expansions, team changes, partnerships — last 6 months",
  "tech_stack": ["known", "tools", "in", "their", "stack"],
  "pain_points": ["sales", "or", "marketing", "specific", "challenges", "for", "this", "SaaS"],
  "buying_signals": ["signals", "they", "need", "outreach", "or", "pipeline", "help"],
  "decision_maker_bio": "Role, background, any content they've published about growth or sales",
  "linkedin_activity": "Recent posts, comments, shares — especially around growth/GTM topics",
  "custom_insights": {}
}

Look for: team growth signals, job postings for sales roles, recent funding that implies scaling pressure.$PROMPT$,
    NULL, 0, 'SaaS-specific research prompt'
);

-- ============================================================
-- SCORING PROMPTS
-- ============================================================

INSERT INTO seed_prompts (industry, template_type, content, avg_reply_rate, sample_size, notes)
VALUES (
    'general',
    'scoring',
    $PROMPT$You are a lead scoring AI. Score this B2B lead for cold email outreach from a cold email agency.

LEAD DATA:
Name: {{first_name}} {{last_name}}
Title: {{title}}
Company: {{company}}
Industry: {{industry}}
Company Size: {{company_size}}
Location: {{location}}

RESEARCH DATA:
{{research_json}}

ICP CRITERIA FOR THIS CAMPAIGN:
Industries: {{icp_industries}}
Company Sizes: {{icp_sizes}}
Target Titles: {{icp_titles}}

SCORING WEIGHTS:
{{weights_json}}

Score this lead 0-100 across four dimensions and return JSON:
{
  "total_score": <0-100>,
  "icp_fit_score": <0-40>,
  "buying_intent_score": <0-30>,
  "timing_score": <0-20>,
  "data_quality_score": <0-10>,
  "reasoning": "2-3 sentences explaining the score. What makes them a good or bad fit? What's the strongest signal?",
  "primary_angle": "The single best hook or angle for the email — what specific thing about them should we reference?"
}

Be strict. Score 70+ only for leads with clear buying signals AND strong ICP fit. Score below 40 means do not email.$PROMPT$,
    NULL, 0, 'General scoring prompt'
);

-- ============================================================
-- EMAIL BODY PROMPTS — Champion / Challenger / Explorer
-- ============================================================

INSERT INTO seed_prompts (industry, template_type, content, avg_reply_rate, sample_size, notes)
VALUES (
    'general',
    'body_champion',
    $PROMPT$You are writing a cold email for a cold email agency. Write a short, direct email — NO fluff, NO fake personalization.

SENDER:
Company: {{sender_company}}
Product/Service: {{product_description}}
Value Prop: {{value_prop}}

RECIPIENT:
Name: {{first_name}} {{last_name}}
Title: {{title}}
Company: {{company}}
Primary Angle: {{primary_angle}}
Research: {{research_summary}}

STYLE: Direct, confident, peer-to-peer. Write like a consultant talking to a peer, not a salesperson.
LENGTH: 4-6 sentences max. No bullet points in the main body.
FORMAT: Plain text only.
CTA: Soft close — "Worth a quick chat?" or similar low-commitment ask.

Write ONLY the email body (no subject line, no sign-off). Start with a specific observation about them or their company — not a compliment.$PROMPT$,
    NULL, 0, 'Champion: direct style, specific observation opener, soft CTA'
),
(
    'general',
    'body_challenger',
    $PROMPT$Write a cold email that opens with a question. Short, curiosity-driven, not salesy.

SENDER:
Company: {{sender_company}}
Product/Service: {{product_description}}
Value Prop: {{value_prop}}

RECIPIENT:
Name: {{first_name}} {{last_name}}
Title: {{title}}
Company: {{company}}
Primary Angle: {{primary_angle}}
Research: {{research_summary}}

STYLE: Opens with a relevant question about a specific challenge or situation at their company. Conversational.
LENGTH: 3-5 sentences. Very short.
FORMAT: Plain text.
CTA: Ask if it's relevant to them — "Is this something you're dealing with at {{company}}?"

Write ONLY the email body. The opening question should be about THEIR business, not about whether they want to buy something.$PROMPT$,
    NULL, 0, 'Challenger: question opener, curiosity-driven, relevance CTA'
),
(
    'general',
    'body_explorer',
    $PROMPT$Write a cold email that leads with a specific result or number, then connects to their situation.

SENDER:
Company: {{sender_company}}
Product/Service: {{product_description}}
Value Prop: {{value_prop}}

RECIPIENT:
Name: {{first_name}} {{last_name}}
Title: {{title}}
Company: {{company}}
Primary Angle: {{primary_angle}}
Research: {{research_summary}}

STYLE: Opens with a concrete result or benchmark (e.g., "We helped [similar company type] get X result in Y timeframe"). Then connect to why this is relevant to {{company}} based on the research.
LENGTH: 4-5 sentences.
FORMAT: Plain text.
CTA: Direct ask — "Would it make sense to show you how?" or "Open to a 15-min call?"

Hypothesis being tested: Does leading with proof/results outperform opening with observation or question?
Write ONLY the email body.$PROMPT$,
    NULL, 0, 'Explorer: result/proof opener — tests social proof hypothesis'
);

-- ============================================================
-- SUBJECT LINE PROMPTS — Champion / Challenger / Explorer
-- ============================================================

INSERT INTO seed_prompts (industry, template_type, content, avg_reply_rate, sample_size, notes)
VALUES (
    'general',
    'subject_champion',
    $PROMPT$Generate 1 cold email subject line. Specific and relevant to this person/company. No clickbait.

Recipient: {{first_name}} {{last_name}}, {{title}} at {{company}}
Email angle: {{primary_angle}}
Industry: {{industry}}

Rules:
- 4-7 words max
- No question marks
- No "quick question" or "touching base"
- Reference something specific (their company, role, or situation)
- Should feel like it came from a peer, not a mass email

Return ONLY the subject line text, nothing else.$PROMPT$,
    NULL, 0, 'Champion subject: statement style, specific, no question mark'
),
(
    'general',
    'subject_challenger',
    $PROMPT$Generate 1 cold email subject line as a short question.

Recipient: {{first_name}} {{last_name}}, {{title}} at {{company}}
Email angle: {{primary_angle}}
Industry: {{industry}}

Rules:
- 5-8 words
- Ends with a question mark
- Must be about their business challenge or situation, not about our service
- Should spark genuine curiosity without feeling like a sales trap
- Example format: "How is {{company}} handling [relevant challenge]?"

Return ONLY the subject line, nothing else.$PROMPT$,
    NULL, 0, 'Challenger subject: question style, curiosity-driven'
),
(
    'general',
    'subject_explorer',
    $PROMPT$Generate 1 cold email subject line that references a specific result or comparison.

Recipient: {{first_name}} {{last_name}}, {{title}} at {{company}}
Email angle: {{primary_angle}}
Industry: {{industry}}

Rules:
- 5-9 words
- References a specific outcome, number, or company type (not theirs directly)
- No generic phrases like "improve your results" or "scale your business"
- Should make them think "that's specific, what is this about?"
- Example formats: "From X to Y in 90 days", "What [similar company type] changed"

Hypothesis: Does a result-referencing subject line outperform statement or question styles?

Return ONLY the subject line, nothing else.$PROMPT$,
    NULL, 0, 'Explorer subject: result/proof reference — tests social proof hypothesis'
);
