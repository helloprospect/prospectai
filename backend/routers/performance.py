from uuid import UUID
from fastapi import APIRouter, Query
import db

router = APIRouter()


@router.get("/{workspace_id}/summary")
async def performance_summary(
    workspace_id: UUID,
    days: int = Query(7, ge=1, le=90),
):
    async with db.get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                count(*) FILTER (WHERE ep.opened) AS opened,
                count(*) FILTER (WHERE ep.replied) AS replied,
                count(*) FILTER (WHERE ep.replied AND ep.reply_sentiment = 'positive') AS positive_replies,
                count(*) FILTER (WHERE ep.bounced) AS bounced,
                count(*) FILTER (WHERE ep.unsubscribed) AS unsubscribed,
                count(*) AS total_sent,
                round(count(*) FILTER (WHERE ep.opened)::numeric / nullif(count(*), 0) * 100, 1) AS open_rate_pct,
                round(count(*) FILTER (WHERE ep.replied)::numeric / nullif(count(*), 0) * 100, 1) AS reply_rate_pct
            FROM email_performance ep
            JOIN email_sends es ON ep.send_id = es.id
            WHERE es.workspace_id = $1
              AND es.sent_at >= NOW() - ($2 || ' days')::interval
            """,
            workspace_id, str(days),
        )
        ab_rows = await conn.fetch(
            """
            SELECT es.body_variant, es.subject_variant,
                count(*) AS sent,
                count(*) FILTER (WHERE ep.opened) AS opened,
                count(*) FILTER (WHERE ep.replied) AS replied
            FROM email_performance ep
            JOIN email_sends es ON ep.send_id = es.id
            WHERE es.workspace_id = $1
              AND es.sent_at >= NOW() - ($2 || ' days')::interval
            GROUP BY es.body_variant, es.subject_variant
            """,
            workspace_id, str(days),
        )
        daily_rows = await conn.fetch(
            """
            SELECT
                date_trunc('day', es.sent_at)::date AS day,
                count(*) AS sent,
                count(*) FILTER (WHERE ep.replied) AS replied
            FROM email_performance ep
            JOIN email_sends es ON ep.send_id = es.id
            WHERE es.workspace_id = $1
              AND es.sent_at >= NOW() - ($2 || ' days')::interval
            GROUP BY 1 ORDER BY 1
            """,
            workspace_id, str(days),
        )

    return {
        "summary": dict(row) if row else {},
        "ab_breakdown": [dict(r) for r in ab_rows],
        "daily": [dict(r) for r in daily_rows],
    }


@router.get("/{workspace_id}/top-leads")
async def top_performing_leads(workspace_id: UUID, limit: int = Query(10, le=50)):
    async with db.get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT l.first_name, l.last_name, l.company, l.title,
                   ep.reply_sentiment, ep.replied_at, ep.reply_text,
                   ls.total_score
            FROM email_performance ep
            JOIN email_sends es ON ep.send_id = es.id
            JOIN leads l ON l.id = es.lead_id
            LEFT JOIN lead_scores ls ON ls.lead_id = l.id
            WHERE es.workspace_id = $1 AND ep.replied = true
              AND ep.reply_sentiment = 'positive'
            ORDER BY ep.replied_at DESC
            LIMIT $2
            """,
            workspace_id, limit,
        )
    return [dict(r) for r in rows]
