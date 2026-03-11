-- ProspectAI Database Schema
-- Multi-tenant cold email + Reddit GTM platform

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for text search

-- ============================================================
-- MULTI-TENANT BASIS
-- ============================================================

CREATE TABLE workspaces (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    TEXT NOT NULL,
    owner_email             TEXT NOT NULL,
    business_profile        JSONB NOT NULL DEFAULT '{}',
    -- {
    --   "company_name": "...",
    --   "website": "...",
    --   "product_description": "...",
    --   "pain_points": ["...", "..."],
    --   "value_prop": "we help X achieve Y by doing Z",
    --   "proof_points": ["...", "..."]
    -- }
    icp_config              JSONB NOT NULL DEFAULT '{}',
    -- {
    --   "industries": ["saas", "ecommerce"],
    --   "company_sizes": ["10-50", "50-200"],
    --   "titles": ["Head of Sales", "Founder", "CEO"],
    --   "geographies": ["US", "UK", "DACH"],
    --   "exclusions": ["freelancers", "non-profits"]
    -- }
    tone_config             JSONB NOT NULL DEFAULT '{}',
    -- {
    --   "style": "direct",  -- or "friendly", "professional"
    --   "example_emails": ["..."],  -- optional
    --   "avoid_phrases": ["...", "..."]
    -- }
    instantly_api_key       TEXT,
    instantly_campaign_id   TEXT,
    reddit_config           JSONB DEFAULT '{}',
    -- {
    --   "enabled": false,
    --   "subreddits": ["entrepreneur", "smallbusiness"],
    --   "reddit_username": "..."
    -- }
    daily_lead_target       INTEGER DEFAULT 50,
    min_score_threshold     INTEGER DEFAULT 50,
    status                  TEXT DEFAULT 'onboarding',
    -- onboarding | active | paused | error
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GLOBAL SEED DATA (admin-only, shared across all workspaces)
-- ============================================================

CREATE TABLE seed_prompts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry            TEXT NOT NULL,
    -- 'saas', 'ecommerce', 'agency', 'professional_services', etc.
    template_type       TEXT NOT NULL,
    -- 'research' | 'scoring'
    -- | 'body_champion' | 'body_challenger' | 'body_explorer'
    -- | 'subject_champion' | 'subject_challenger' | 'subject_explorer'
    content             TEXT NOT NULL,
    avg_reply_rate      FLOAT,
    avg_open_rate       FLOAT,
    sample_size         INTEGER DEFAULT 0,
    notes               TEXT,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE industry_benchmarks (
    industry                TEXT PRIMARY KEY,
    avg_open_rate           FLOAT NOT NULL,
    avg_reply_rate          FLOAT NOT NULL,
    top_decile_reply_rate   FLOAT,
    sample_size             INTEGER DEFAULT 0,
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROMPT TEMPLATES (per workspace, evolve via optimizer)
-- ============================================================

CREATE TABLE prompt_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    template_type       TEXT NOT NULL,
    -- 'research' | 'scoring'
    -- | 'body_champion' | 'body_challenger' | 'body_explorer'
    -- | 'subject_champion' | 'subject_challenger' | 'subject_explorer'
    version             INTEGER NOT NULL DEFAULT 1,
    content             TEXT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT FALSE,
    performance_score   FLOAT,
    seeded_from         UUID REFERENCES seed_prompts(id),
    created_by          TEXT DEFAULT 'seed',
    -- 'seed' | 'human' | 'claude_optimizer'
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    retired_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_prompt_templates_active
    ON prompt_templates(workspace_id, template_type)
    WHERE is_active = TRUE;

-- ============================================================
-- SCORING WEIGHTS (per workspace, evolve via optimizer)
-- ============================================================

CREATE TABLE scoring_weights (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,
    weights         JSONB NOT NULL DEFAULT '{
        "icp_industry": 0.15,
        "icp_size": 0.10,
        "icp_title": 0.15,
        "intent_job_posting": 0.10,
        "intent_funding": 0.10,
        "intent_tech_change": 0.10,
        "timing_recent_news": 0.10,
        "timing_growth_signal": 0.10,
        "data_quality": 0.10
    }',
    min_score_threshold INTEGER DEFAULT 50,
    rationale       TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_scoring_weights_active
    ON scoring_weights(workspace_id)
    WHERE is_active = TRUE;

-- ============================================================
-- LEADS
-- ============================================================

CREATE TABLE leads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    first_name      TEXT,
    last_name       TEXT,
    company         TEXT,
    title           TEXT,
    linkedin_url    TEXT,
    website         TEXT,
    industry        TEXT,
    company_size    TEXT,
    location        TEXT,
    source          TEXT NOT NULL DEFAULT 'searchleads',
    -- 'searchleads' | 'apify' | 'reddit' | 'manual'
    source_raw      JSONB,
    status          TEXT NOT NULL DEFAULT 'raw',
    -- raw → researched → scored → personalized → sent → replied → converted | archived
    reddit_context  JSONB,
    -- if source='reddit': {post_id, subreddit, post_title}
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, email)
);

CREATE TABLE lead_research (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    lead_id             UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    company_summary     TEXT,
    recent_news         TEXT,
    tech_stack          TEXT[],
    pain_points         TEXT[],
    buying_signals      TEXT[],
    decision_maker_bio  TEXT,
    linkedin_activity   TEXT,
    custom_insights     JSONB,
    research_model      TEXT DEFAULT 'claude-sonnet-4-6',
    prompt_template_id  UUID REFERENCES prompt_templates(id),
    tokens_used         INTEGER,
    researched_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lead_scores (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    lead_id             UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    total_score         INTEGER NOT NULL,
    icp_fit_score       INTEGER,
    buying_intent_score INTEGER,
    timing_score        INTEGER,
    data_quality_score  INTEGER,
    score_breakdown     JSONB,
    weight_version_id   UUID REFERENCES scoring_weights(id),
    prompt_template_id  UUID REFERENCES prompt_templates(id),
    tokens_used         INTEGER,
    scored_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EMAIL SYSTEM
-- ============================================================

CREATE TABLE email_variants (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    lead_id               UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    -- One personalized email per lead (pre-selected by weighted CCC draw)
    body_text             TEXT,
    subject_text          TEXT,
    body_template_type    TEXT,
    -- 'body_champion' | 'body_challenger' | 'body_explorer'
    subject_template_type TEXT,
    -- 'subject_champion' | 'subject_challenger' | 'subject_explorer'
    body_template_id      UUID REFERENCES prompt_templates(id),
    subject_template_id   UUID REFERENCES prompt_templates(id),
    tokens_used           INTEGER,
    generated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_sends (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    lead_id                 UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    variant_id              UUID REFERENCES email_variants(id),
    instantly_lead_id       TEXT,
    campaign_id             TEXT,
    body_variant            TEXT,   -- 'body_champion' | 'body_challenger' | 'body_explorer'
    subject_variant         TEXT,   -- 'subject_champion' | 'subject_challenger' | 'subject_explorer'
    sent_at                 TIMESTAMPTZ,
    status                  TEXT DEFAULT 'queued'
    -- queued | sent | bounced | error
);

CREATE TABLE email_performance (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    send_id             UUID REFERENCES email_sends(id),
    lead_id             UUID REFERENCES leads(id),
    opened              BOOLEAN DEFAULT FALSE,
    open_count          INTEGER DEFAULT 0,
    first_opened_at     TIMESTAMPTZ,
    replied             BOOLEAN DEFAULT FALSE,
    replied_at          TIMESTAMPTZ,
    instantly_interest_status INTEGER DEFAULT 0,
    -- Instantly: 1/2/3 = positive, -1/-2/-3 = negative, 0 = no reply
    reply_sentiment     TEXT,
    -- 'positive' | 'negative' | 'neutral' | 'ooo'
    reply_text          TEXT,
    bounced             BOOLEAN DEFAULT FALSE,
    unsubscribed        BOOLEAN DEFAULT FALSE,
    converted           BOOLEAN DEFAULT FALSE,
    synced_at           TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(send_id)
);

-- ============================================================
-- OPTIMIZATION ENGINE
-- ============================================================

CREATE TABLE optimization_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    run_type            TEXT DEFAULT 'nightly',
    -- 'nightly' | 'manual' | 'triggered'
    period_start        DATE,
    period_end          DATE,
    leads_analyzed      INTEGER,
    emails_analyzed     INTEGER,
    avg_open_rate       FLOAT,
    avg_reply_rate      FLOAT,
    benchmark_open_rate FLOAT,
    benchmark_reply_rate FLOAT,
    changes_made        JSONB,
    claude_reasoning    TEXT,
    new_prompt_ids      UUID[],
    new_weight_id       UUID REFERENCES scoring_weights(id),
    confidence          FLOAT,
    status              TEXT DEFAULT 'completed',
    -- 'completed' | 'needs_review' | 'paused_anomaly' | 'skipped_insufficient_data'
    ran_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- REDDIT SYSTEM
-- ============================================================

CREATE TABLE reddit_posts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    reddit_post_id      TEXT NOT NULL,
    subreddit           TEXT,
    title               TEXT,
    body                TEXT,
    author              TEXT,
    url                 TEXT,
    relevance_score     INTEGER,
    intent_level        TEXT,   -- 'high' | 'medium' | 'low'
    action_taken        TEXT,   -- 'commented' | 'dm_sent' | 'ignored' | 'content_posted'
    processed_at        TIMESTAMPTZ DEFAULT NOW(),
    posted_at           TIMESTAMPTZ,
    UNIQUE(workspace_id, reddit_post_id)
);

CREATE TABLE reddit_actions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    post_id             UUID REFERENCES reddit_posts(id),
    action_type         TEXT,   -- 'comment' | 'dm' | 'post'
    content             TEXT,
    reddit_author       TEXT,
    reddit_comment_id   TEXT,
    lead_id             UUID REFERENCES leads(id),
    engagement_result   TEXT,   -- 'upvoted' | 'replied' | 'ignored' | 'pending'
    performed_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_leads_workspace_status ON leads(workspace_id, status);
CREATE INDEX idx_leads_workspace_source ON leads(workspace_id, source);
CREATE INDEX idx_leads_workspace_created ON leads(workspace_id, created_at DESC);
CREATE INDEX idx_email_variants_lead ON email_variants(lead_id);
CREATE INDEX idx_email_variants_body_type ON email_variants(workspace_id, body_template_type);
CREATE INDEX idx_lead_research_lead ON lead_research(lead_id);
CREATE INDEX idx_lead_scores_lead ON lead_scores(lead_id);
CREATE INDEX idx_email_sends_workspace ON email_sends(workspace_id, sent_at DESC);
CREATE INDEX idx_email_perf_replied ON email_performance(workspace_id, replied);
CREATE INDEX idx_email_perf_synced ON email_performance(synced_at DESC);
CREATE INDEX idx_prompt_templates_workspace ON prompt_templates(workspace_id, template_type);
CREATE INDEX idx_optimization_runs_workspace ON optimization_runs(workspace_id, ran_at DESC);
CREATE INDEX idx_reddit_posts_workspace ON reddit_posts(workspace_id, processed_at DESC);
CREATE INDEX idx_seed_prompts_industry ON seed_prompts(industry, template_type) WHERE is_active = TRUE;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_workspaces_updated_at
    BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
