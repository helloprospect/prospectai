"""
APScheduler configuration.
All scheduled jobs live here — no n8n needed.
"""
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()


def start_scheduler():
    scheduler.add_job(
        _run_pipeline_all,
        trigger=IntervalTrigger(hours=4),
        id="email_pipeline",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.add_job(
        _run_optimizer_all,
        trigger=CronTrigger(hour=0, minute=0, timezone="UTC"),
        id="nightly_optimizer",
        replace_existing=True,
        misfire_grace_time=600,
    )
    scheduler.add_job(
        _sync_instantly_all,
        trigger=IntervalTrigger(hours=1),
        id="instantly_sync",
        replace_existing=True,
        misfire_grace_time=300,
    )
    scheduler.start()
    logger.info("[scheduler] Started: pipeline=4h, optimizer=nightly, sync=1h")


def stop_scheduler():
    scheduler.shutdown(wait=False)
    logger.info("[scheduler] Stopped")


async def _run_pipeline_all():
    from services.email_pipeline import run_pipeline
    workspace_ids = await _get_active_workspace_ids()
    for wid in workspace_ids:
        try:
            await run_pipeline(wid)
        except Exception as e:
            logger.error(f"[scheduler] Pipeline failed for workspace {wid}: {e}")


async def _run_optimizer_all():
    from services.optimizer import run_optimization_for_all_workspaces
    try:
        await run_optimization_for_all_workspaces()
    except Exception as e:
        logger.error(f"[scheduler] Optimizer failed: {e}")


async def _sync_instantly_all():
    import db
    from services.instantly_sync import sync_performance_for_workspace
    workspace_ids = await _get_active_workspace_ids()
    async with db.get_conn() as conn:
        for wid in workspace_ids:
            try:
                await sync_performance_for_workspace(wid, conn)
            except Exception as e:
                logger.error(f"[scheduler] Instantly sync failed for workspace {wid}: {e}")


async def _get_active_workspace_ids():
    import db
    async with db.get_conn() as conn:
        rows = await conn.fetch("SELECT id FROM workspaces WHERE status = 'active'")
    return [r["id"] for r in rows]
