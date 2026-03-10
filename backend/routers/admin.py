from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
import db

router = APIRouter()


class SeedPromptCreate(BaseModel):
    industry: str
    template_type: str
    content: str
    avg_reply_rate: float | None = None
    avg_open_rate: float | None = None
    sample_size: int = 0
    notes: str | None = None


class BenchmarkUpsert(BaseModel):
    industry: str
    avg_open_rate: float
    avg_reply_rate: float
    top_decile_reply_rate: float | None = None
    sample_size: int = 0


@router.post("/seed-prompts")
async def create_seed_prompt(payload: SeedPromptCreate):
    async with db.get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO seed_prompts
                (industry, template_type, content, avg_reply_rate, avg_open_rate, sample_size, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
            """,
            payload.industry, payload.template_type, payload.content,
            payload.avg_reply_rate, payload.avg_open_rate, payload.sample_size, payload.notes,
        )
    return dict(row)


@router.get("/seed-prompts")
async def list_seed_prompts(industry: str | None = None):
    async with db.get_conn() as conn:
        if industry:
            rows = await conn.fetch(
                "SELECT * FROM seed_prompts WHERE industry = $1 ORDER BY template_type",
                industry,
            )
        else:
            rows = await conn.fetch("SELECT * FROM seed_prompts ORDER BY industry, template_type")
    return [dict(r) for r in rows]


@router.put("/benchmarks")
async def upsert_benchmark(payload: BenchmarkUpsert):
    async with db.get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO industry_benchmarks
                (industry, avg_open_rate, avg_reply_rate, top_decile_reply_rate, sample_size)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (industry) DO UPDATE SET
                avg_open_rate = EXCLUDED.avg_open_rate,
                avg_reply_rate = EXCLUDED.avg_reply_rate,
                top_decile_reply_rate = EXCLUDED.top_decile_reply_rate,
                sample_size = EXCLUDED.sample_size,
                updated_at = NOW()
            RETURNING *
            """,
            payload.industry, payload.avg_open_rate, payload.avg_reply_rate,
            payload.top_decile_reply_rate, payload.sample_size,
        )
    return dict(row)


@router.get("/benchmarks")
async def list_benchmarks():
    async with db.get_conn() as conn:
        rows = await conn.fetch("SELECT * FROM industry_benchmarks ORDER BY industry")
    return [dict(r) for r in rows]
