# ProspectAI — CLAUDE.md

AI-native B2B cold outreach platform. Fully automated pipeline: lead sourcing → AI research → scoring → personalized email generation → sending via Instantly. Includes a self-optimizing engine (Claude rewrites its own prompts nightly) and a Reddit GTM monitor.

---

## Repository Layout

```
prospectai/
├── backend/                # FastAPI Python backend
│   ├── main.py             # App entry point, middleware, router registration
│   ├── config.py           # Pydantic settings (env vars)
│   ├── db.py               # asyncpg connection pool + context managers
│   ├── scheduler.py        # APScheduler jobs (pipeline, optimizer, reddit, sync)
│   ├── routers/
│   │   ├── workspaces.py   # CRUD + seeding of prompt templates
│   │   ├── campaigns.py    # Pipeline trigger + status
│   │   ├── leads.py        # Lead listing + pipeline counts
│   │   ├── performance.py  # Email stats, A/B breakdown, daily series
│   │   ├── optimizer.py    # Optimization runs, prompt/weight management
│   │   ├── reddit.py       # Reddit stats + action history
│   │   └── admin.py        # Admin endpoints (seed prompts, benchmarks)
│   ├── services/
│   │   ├── claude_client.py     # All Anthropic API calls (central module)
│   │   ├── email_pipeline.py    # 5-stage pipeline: source→research→score→personalize→send
│   │   ├── optimizer.py         # Nightly optimization analysis + prompt rewriting
│   │   ├── instantly_sync.py    # Sync email performance stats from Instantly API
│   │   ├── reddit_service.py    # PRAW-based Reddit monitor + AI comment/DM writer
│   │   ├── searchleads.py       # SearchLeads API client (lead sourcing)
│   │   └── safety.py            # Safety/rate-limit guards
│   ├── Dockerfile           # Dev image (with --reload)
│   └── requirements.txt
├── frontend/               # Next.js 14 App Router frontend
│   ├── app/
│   │   ├── layout.tsx       # Root layout with Sidebar
│   │   ├── page.tsx         # Redirects to /dashboard
│   │   ├── dashboard/       # KPI cards, pipeline status, A/B chart
│   │   ├── campaigns/       # Pipeline trigger + status view
│   │   ├── leads/           # Lead table with status filter
│   │   ├── optimizer/       # Optimization run history, prompt viewer
│   │   ├── reddit/          # Reddit stats + action log
│   │   └── onboarding/      # Workspace creation wizard
│   ├── components/
│   │   ├── Sidebar.tsx      # Nav sidebar (hidden on /onboarding)
│   │   └── StatCard.tsx     # Reusable metric card
│   ├── lib/api.ts           # Typed API client (all fetch calls + TypeScript interfaces)
│   ├── next.config.js       # Proxies /api/* → backend via BACKEND_URL
│   ├── tailwind.config.ts   # Brand color palette (violet/purple)
│   └── tsconfig.json        # Strict TS, @/* path alias maps to ./
├── database/
│   ├── schema.sql           # Full PostgreSQL schema (run on first boot)
│   └── seed_data/
│       ├── seed_prompts.sql # Default Claude prompt templates by industry
│       └── benchmarks.sql   # Industry email benchmarks
├── docker-compose.yml       # Local dev: postgres + backend (with hot reload)
├── Dockerfile.railway       # Production image (backend only, reads PORT env)
├── railway.toml             # Railway deploy config (health: /health)
├── .env.example             # Root env template (for docker-compose)
└── DEPLOY.md                # Deployment guide
```

---

## Tech Stack

### Backend
- **Python 3.11**, **FastAPI 0.115**, **uvicorn**
- **asyncpg 0.29** — raw async PostgreSQL (no ORM for queries)
- **SQLAlchemy + Alembic** — installed but schema is managed via raw `schema.sql` (auto-applied on first boot)
- **APScheduler 3.10** — in-process async scheduler (no separate worker needed)
- **Anthropic SDK 0.40** (`anthropic.AsyncAnthropic`) — all AI calls route through `services/claude_client.py`
- **PRAW 7.7** — Reddit API
- **tenacity 9.0** — retry logic on Claude API calls (3 attempts, exponential backoff)
- **pydantic-settings 2.5** — typed config from environment variables
- **python-jose + passlib** — JWT/auth utilities (available but auth not enforced on current routes)

### Frontend
- **Next.js 14.2** (App Router), **React 18**, **TypeScript 5**
- **SWR 2.2** — data fetching + caching
- **Recharts 2.13** — charts (BarChart on dashboard)
- **Tailwind CSS 3.4** — utility-first styling; dark theme using zinc palette + custom `brand` colors (violet)
- **clsx** — conditional class names
- **Inter** (Google Fonts) — primary typeface

### Database
- **PostgreSQL 16** (local via Docker; production on Supabase or Railway Postgres)

### External APIs
| Service | Purpose | Config key |
|---|---|---|
| Anthropic | AI research, scoring, email personalization, optimization | `ANTHROPIC_API_KEY` |
| SearchLeads | B2B lead sourcing | `SEARCHLEADS_API_KEY` |
| Instantly | Email sending + performance stats | `INSTANTLY_API_KEY` |
| Apify | Web scraping (optional lead source) | `APIFY_API_KEY` |
| Reddit (PRAW) | Reddit GTM monitoring | `REDDIT_CLIENT_ID/SECRET` |

---

## Core Concepts

### Multi-Tenant: Workspaces
Every resource is scoped to a `workspace_id` (UUID). A workspace holds:
- `business_profile` — company name, product description, value prop
- `icp_config` — target industries, titles, company sizes, geographies, exclusions
- `tone_config` — email style preferences
- `daily_lead_target`, `min_score_threshold` — pipeline controls
- `instantly_api_key`, `instantly_campaign_id` — per-workspace Instantly integration
- `reddit_config` — subreddits to monitor, enable/disable flag

### Email Pipeline (5 Stages)
Runs every 4 hours (scheduler) or on-demand via `POST /api/campaigns/{workspace_id}/run-pipeline`.

```
raw → researched → scored → personalized → sent → replied/converted | archived
```

1. **Source** (`source_leads`): Calls SearchLeads API, deduplicates by `(workspace_id, email)`, inserts as `status='raw'`
2. **Research** (`research_leads`): Claude analyzes each lead — company summary, tech stack, pain points, buying signals. Concurrency: 5 leads at once
3. **Score** (`score_leads`): Claude scores each lead 0–100 against ICP + weights. Below `min_score_threshold` → `archived`. Concurrency: 10
4. **Personalize** (`personalize_leads`): Claude generates 4 email variants (body_a, body_b, subject_a, subject_b) in one API call. Concurrency: 5
5. **Send** (`send_leads`): Pushes to Instantly with random A/B variant assignment

### Prompt Templates
6 template types per workspace: `research`, `scoring`, `body_a`, `body_b`, `subject_a`, `subject_b`.
- Seeded from `seed_prompts` table on workspace creation (industry-matched, falls back to `general`)
- Only one active template per type per workspace (enforced by unique partial index)
- `created_by` values: `'seed'` | `'human'` | `'claude_optimizer'`
- Templates use `{{variable}}` double-brace interpolation (filled by `_fill_template()` in `claude_client.py`)

### Self-Optimizing Engine
Runs nightly at 00:00 UTC. Flow:
1. Aggregates last 30 days of performance data
2. Compares vs. `industry_benchmarks`
3. Claude (`run_optimization_analysis`) analyzes and recommends prompt rewrites + weight changes
4. If confidence ≥ 0.7 → auto-applies. Below threshold → saves as `needs_review` for human approval
5. Approved via `POST /api/optimizer/{workspace_id}/runs/{run_id}/approve`

### Reddit Monitor
Runs every 30 minutes for workspaces with `reddit_config.enabled = true`.
- Fetches new posts from configured subreddits via PRAW
- Claude classifies relevance (0–10) and intent (`high`/`medium`/`low`)
- Relevance ≥ 7 → writes helpful comment; ≥ 8 + explicit ask → sends DM
- Actions logged in `reddit_actions`; warm leads may be inserted into `leads` table with `source='reddit'`

---

## Database Conventions

- All PKs are `UUID DEFAULT gen_random_uuid()`
- All tables have `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
- `workspaces` and `leads` have `updated_at` auto-updated by trigger
- JSONB columns for flexible config: `business_profile`, `icp_config`, `tone_config`, `reddit_config`, `weights`, `score_breakdown`, `custom_insights`
- Arrays as `TEXT[]` for `tech_stack`, `pain_points`, `buying_signals`
- Lead `status` lifecycle: `raw → researched → scored → personalized → sent → replied → converted | archived`
- Schema is NOT managed by Alembic migrations — it is applied once via `auto_init_db()` on first boot. For schema changes, update `database/schema.sql` and handle migrations manually

---

## Database Access Patterns

Use `db.py` context managers — never use the pool directly:

```python
# Read-only
async with db.get_conn() as conn:
    rows = await conn.fetch("SELECT ...", param1, param2)
    row  = await conn.fetchrow("SELECT ... WHERE id = $1", workspace_id)
    val  = await conn.fetchval("SELECT count(*) FROM ...", workspace_id)

# Write with transaction
async with db.get_tx() as conn:
    await conn.execute("INSERT INTO ... VALUES ($1, $2)", val1, val2)
```

- Always use parameterized queries (`$1, $2, ...`) — never f-string SQL values
- Pool: min 2, max 10 connections, 60s command timeout

---

## Claude API Usage

All AI calls go through `services/claude_client.py`. **Never import `anthropic` directly in routers or other services.**

```python
from services import claude_client

# Text response
text, tokens = await claude_client.complete(system, user, max_tokens=2048, temperature=0.3)

# JSON response (handles markdown code fences automatically)
data, tokens = await claude_client.complete_json(system, user, max_tokens=2048)

# Domain helpers
research, tokens = await claude_client.research_lead(template, lead_dict)
score, tokens    = await claude_client.score_lead(template, lead, research, weights, icp)
variants, tokens = await claude_client.personalize_email(body_a, body_b, subj_a, subj_b, lead, research, score, workspace)
```

- Model configured via `CLAUDE_MODEL` env var (default: `claude-sonnet-4-6`)
- Retried up to 3× with exponential backoff via `tenacity`
- Always return `(result, tokens_used)` tuples — log tokens to DB

---

## API Routes Summary

All routes prefixed with `/api/`:

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/workspaces` | Create workspace (seeds prompts + weights) |
| GET | `/workspaces` | List all workspaces |
| GET/PATCH | `/workspaces/{id}` | Get/update workspace |
| GET | `/workspaces/{id}/stats` | Lead counts + email stats |
| POST | `/campaigns/{id}/run-pipeline` | Trigger pipeline (background) |
| GET | `/campaigns/{id}/pipeline-status` | Pipeline stage counts |
| GET | `/leads/{id}` | List leads (filterable by status) |
| GET | `/leads/{id}/pipeline/counts` | Counts by status |
| GET | `/performance/{id}/summary` | Email performance summary + A/B + daily |
| GET | `/optimizer/{id}/runs` | List optimization runs |
| POST | `/optimizer/{id}/run` | Trigger manual optimization |
| POST | `/optimizer/{id}/runs/{run_id}/approve` | Apply pending optimization |
| GET | `/optimizer/{id}/prompts` | List prompt templates (with preview) |
| GET | `/optimizer/{id}/weights` | List scoring weight versions |
| GET | `/reddit/{id}/stats` | Reddit engagement summary |
| GET | `/reddit/{id}/actions` | Reddit action log |

---

## Frontend Conventions

- **App Router** — all pages in `app/` are React Server Components by default; add `"use client"` only when needed (SWR, event handlers, `usePathname`)
- **API calls** — always use `lib/api.ts`. Add new endpoints there as typed functions. The `request<T>()` helper handles JSON headers and error throwing
- **Next.js proxy** — `next.config.js` rewrites `/api/*` → backend. Frontend never calls the backend port directly
- **NEXT_PUBLIC_WORKSPACE_ID** — fallback workspace ID for single-tenant dev; SWR fetches the first workspace dynamically in production
- **Styling** — dark zinc palette. Key color tokens:
  - Background: `#09090b` (body), `#111113` (cards), `#18181b` (hover)
  - Border: `#27272a`
  - Text primary: `#fafafa`; secondary: `#a1a1aa`; muted: `#71717a`; disabled: `#52525b`
  - Brand (violet): `brand-400` = `#a78bfa`, `brand-500` = `#8b5cf6`
- **No auth layer on frontend** — workspace isolation is by ID, not user session

---

## Development Setup

### Local (Docker Compose)

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and any other keys

docker compose up
# Backend: http://localhost:8000
# Postgres: localhost:5432
```

The backend mounts `./backend` as a volume and runs with `--reload`. Schema is auto-applied on first boot.

### Frontend (separate terminal)

```bash
cd frontend
cp .env.local.example .env.local
# BACKEND_URL=http://localhost:8000
npm install
npm run dev
# http://localhost:3000
```

### Backend only (no Docker)

```bash
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql://... ANTHROPIC_API_KEY=sk-ant-... uvicorn main:app --reload
```

---

## Adding New Features

### New API endpoint
1. Add route function to the appropriate `backend/routers/*.py`
2. Use `db.get_conn()` (read) or `db.get_tx()` (write) — never raw pool
3. Add the typed function to `frontend/lib/api.ts`
4. Add/update TypeScript interfaces in `lib/api.ts` if new response shape

### New Claude capability
1. Add a function to `services/claude_client.py` following the `(result, tokens)` return convention
2. Call it from a service (not directly from a router)

### Schema change
1. Update `database/schema.sql`
2. Write a manual migration SQL and apply it to existing databases
3. There are no Alembic migration files — schema evolution is manual

### New scheduler job
Add to `backend/scheduler.py` in `start_scheduler()`. Use `IntervalTrigger` or `CronTrigger`. Wrap the job body in try/except and log errors — never let a job exception crash the scheduler.

---

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://prospectai:devpassword@localhost:5432/prospectai` | Yes | PostgreSQL DSN |
| `ANTHROPIC_API_KEY` | — | Yes | Anthropic API key |
| `SEARCHLEADS_API_KEY` | — | For pipeline | Lead sourcing API |
| `INSTANTLY_API_KEY` | — | For sending | Email sending platform |
| `APIFY_API_KEY` | — | Optional | Web scraping |
| `REDDIT_CLIENT_ID` | — | For Reddit feature | Reddit app credentials |
| `REDDIT_CLIENT_SECRET` | — | For Reddit feature | Reddit app credentials |
| `REDDIT_USER_AGENT` | `ProspectAI/1.0` | No | Reddit API user agent |
| `SECRET_KEY` | `dev-secret-key-change-in-prod` | Prod only | JWT signing key |
| `ALLOWED_ORIGINS` | `http://localhost:3000,...` | No | CORS origins (comma-separated) |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | No | Anthropic model ID |
| `DEFAULT_LEAD_BATCH_SIZE` | `50` | No | Leads per pipeline run |
| `DEFAULT_RESEARCH_CONCURRENCY` | `5` | No | Parallel Claude research calls |
| Frontend: `BACKEND_URL` | `http://localhost:8000` | No | Backend URL for Next.js proxy |
| Frontend: `NEXT_PUBLIC_WORKSPACE_ID` | — | No | Fallback workspace for dev |

---

## Deployment

### Production (Railway)
- `Dockerfile.railway` builds backend + database SQL files into one image
- `railway.toml` uses this Dockerfile; health check at `/health`
- Reads `PORT` env var (set by Railway)
- Database: Supabase Postgres or Railway Postgres add-on

### Frontend (Vercel / Railway)
- `cd frontend && npm run build && npm start`
- Set `BACKEND_URL` to the production backend URL
- Set `NEXT_PUBLIC_WORKSPACE_ID` if single-tenant

See `DEPLOY.md` for full deployment walkthrough.

---

## Key Patterns & Gotchas

- **Template variables** use double braces: `{{first_name}}`, `{{company}}` — interpolated by `_fill_template()` in `claude_client.py`. Single braces are literal text
- **JSON from Claude** — always use `complete_json()` which strips markdown code fences. Claude sometimes wraps JSON in ` ```json ``` `
- **Lead deduplication** — `(workspace_id, email)` unique constraint. The pipeline uses `ON CONFLICT DO NOTHING` — check inserted count vs. fetched count to see dedup rate
- **Scoring threshold** — workspace-level `min_score_threshold` takes precedence over the weight version's threshold. Leads below threshold become `archived` (not deleted)
- **A/B variants** — body and subject variants are assigned independently and randomly at send time (not at generation time)
- **No authentication** on API routes currently — all routes are open. The `SECRET_KEY`, `python-jose`, and `passlib` are installed but auth middleware is not wired up yet
- **Instantly integration is per-workspace** — each workspace has its own `instantly_api_key` and `instantly_campaign_id`, stored in the `workspaces` table (not global config)
- **Scheduler runs inside the FastAPI process** — no separate Celery/Redis worker. Fine for single-instance deploys; not suitable for horizontal scaling without a distributed lock
