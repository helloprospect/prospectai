import logging
import pathlib
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import db
from config import settings
from scheduler import start_scheduler, stop_scheduler
from routers import workspaces, campaigns, leads, performance, optimizer, reddit, admin

logger = logging.getLogger(__name__)


async def auto_init_db():
    """On first boot, run schema.sql + seed files if tables don't exist yet."""
    async with db.get_conn() as conn:
        exists = await conn.fetchval(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspaces')"
        )
        if exists:
            return
        logger.info("First boot detected — initialising database schema...")
        base = pathlib.Path(__file__).parent / "database"
        schema_file = base / "schema.sql"
        if schema_file.exists():
            await conn.execute(schema_file.read_text())
            logger.info("schema.sql applied")
        seed_dir = base / "seed_data"
        if seed_dir.exists():
            for sql_file in sorted(seed_dir.glob("*.sql")):
                await conn.execute(sql_file.read_text())
                logger.info(f"Seed applied: {sql_file.name}")
        logger.info("Database initialisation complete.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_pool()
    await auto_init_db()
    start_scheduler()
    yield
    stop_scheduler()
    await db.close_pool()


app = FastAPI(
    title="ProspectAI API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.ALLOWED_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workspaces.router, prefix="/api/workspaces", tags=["workspaces"])
app.include_router(campaigns.router, prefix="/api/campaigns", tags=["campaigns"])
app.include_router(leads.router, prefix="/api/leads", tags=["leads"])
app.include_router(performance.router, prefix="/api/performance", tags=["performance"])
app.include_router(optimizer.router, prefix="/api/optimizer", tags=["optimizer"])
app.include_router(reddit.router, prefix="/api/reddit", tags=["reddit"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok"}
