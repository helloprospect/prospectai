import asyncpg
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from config import settings

_pool: asyncpg.Pool | None = None


async def init_pool():
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL,
        min_size=2,
        max_size=10,
        command_timeout=60,
    )


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialized")
    return _pool


@asynccontextmanager
async def get_conn() -> AsyncGenerator[asyncpg.Connection, None]:
    async with get_pool().acquire() as conn:
        yield conn


@asynccontextmanager
async def get_tx() -> AsyncGenerator[asyncpg.Connection, None]:
    async with get_pool().acquire() as conn:
        async with conn.transaction():
            yield conn
