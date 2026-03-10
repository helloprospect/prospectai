"""
Reddit GTM service.
Monitors subreddits, classifies posts, comments/DMs, enriches warm leads.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta
from uuid import UUID

import praw
import db
from services import claude_client
from services.searchleads import SearchLeadsClient
from config import settings

logger = logging.getLogger(__name__)

RATE_LIMITS = {
    "max_comments_per_day": 15,
    "max_dms_per_day": 10,
    "max_posts_per_week": 3,
    "cooldown_minutes_per_subreddit": 60,
    "min_author_account_age_days": 30,
}

TRIGGER_PHRASES = [
    "cold email", "outreach", "lead generation", "sales automation",
    "email marketing", "prospecting", "pipeline", "b2b leads",
    "not getting replies", "low open rate", "sales process",
    "looking for clients", "how to get customers", "improve open rate",
    "email sequence", "email campaign", "warm leads",
]


def _get_reddit_client() -> praw.Reddit:
    return praw.Reddit(
        client_id=settings.REDDIT_CLIENT_ID,
        client_secret=settings.REDDIT_CLIENT_SECRET,
        user_agent=settings.REDDIT_USER_AGENT,
        username=settings.get("REDDIT_USERNAME", ""),
        password=settings.get("REDDIT_PASSWORD", ""),
    )


async def run_reddit_monitor(workspace_id: UUID):
    async with db.get_conn() as conn:
        workspace = await conn.fetchrow("SELECT * FROM workspaces WHERE id = $1", workspace_id)

    if not workspace:
        return

    reddit_config = workspace["reddit_config"] or {}
    if not reddit_config.get("enabled"):
        return

    subreddits = reddit_config.get("subreddits") or [
        "entrepreneur", "smallbusiness", "sales", "startups",
        "b2bsales", "marketing",
    ]

    # Check daily rate limits
    async with db.get_conn() as conn:
        today_comments = await conn.fetchval(
            """
            SELECT count(*) FROM reddit_actions
            WHERE workspace_id = $1 AND action_type = 'comment'
              AND performed_at >= NOW() - interval '24 hours'
            """,
            workspace_id,
        )
        today_dms = await conn.fetchval(
            """
            SELECT count(*) FROM reddit_actions
            WHERE workspace_id = $1 AND action_type = 'dm'
              AND performed_at >= NOW() - interval '24 hours'
            """,
            workspace_id,
        )

    if today_comments >= RATE_LIMITS["max_comments_per_day"] and today_dms >= RATE_LIMITS["max_dms_per_day"]:
        logger.info(f"[reddit] Workspace {workspace_id} hit daily limits, skipping")
        return

    # Fetch new posts from subreddits
    new_posts = await _fetch_new_posts(workspace_id, subreddits)
    if not new_posts:
        return

    # Classify in batches of 10
    batch_size = 10
    for i in range(0, len(new_posts), batch_size):
        batch = new_posts[i:i + batch_size]
        try:
            classifications, _ = await claude_client.classify_reddit_post(batch)
        except Exception as e:
            logger.error(f"[reddit] Classification failed: {e}")
            continue

        # Index classifications by post_id
        class_map = {c["post_id"]: c for c in classifications}

        for post in batch:
            classification = class_map.get(post["reddit_post_id"], {})
            relevance = classification.get("relevance", 0)
            action = classification.get("action", "ignore")
            intent = classification.get("intent", "low")

            # Save the classified post
            async with db.get_conn() as conn:
                await conn.execute(
                    """
                    UPDATE reddit_posts
                    SET relevance_score = $1, intent_level = $2, action_taken = $3
                    WHERE id = $4
                    """,
                    relevance, intent, action, post["db_id"],
                )

            if action == "ignore" or relevance < 7:
                continue

            # Check subreddit cooldown
            async with db.get_conn() as conn:
                recent = await conn.fetchval(
                    """
                    SELECT count(*) FROM reddit_actions ra
                    JOIN reddit_posts rp ON ra.post_id = rp.id
                    WHERE rp.workspace_id = $1 AND rp.subreddit = $2
                      AND ra.performed_at >= NOW() - ($3 || ' minutes')::interval
                    """,
                    workspace_id, post["subreddit"],
                    str(RATE_LIMITS["cooldown_minutes_per_subreddit"]),
                )
            if recent:
                logger.debug(f"[reddit] Subreddit r/{post['subreddit']} in cooldown, skipping")
                continue

            # Execute action
            if action == "comment" and today_comments < RATE_LIMITS["max_comments_per_day"]:
                await _post_comment(workspace_id, post, dict(workspace))
                today_comments += 1
            elif action == "dm" and today_dms < RATE_LIMITS["max_dms_per_day"]:
                await _send_dm(workspace_id, post, dict(workspace))
                today_dms += 1


async def _fetch_new_posts(workspace_id: UUID, subreddits: list[str]) -> list[dict]:
    """Fetch posts from last 30 minutes that contain trigger phrases."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=35)
    new_posts = []

    # Run PRAW in executor since it's sync
    loop = asyncio.get_event_loop()

    def _fetch():
        reddit = _get_reddit_client()
        results = []
        for sub_name in subreddits:
            try:
                sub = reddit.subreddit(sub_name)
                for post in sub.new(limit=50):
                    created = datetime.fromtimestamp(post.created_utc, tz=timezone.utc)
                    if created < cutoff:
                        continue
                    if post.removed_by_category:
                        continue
                    text = f"{post.title} {post.selftext}".lower()
                    if any(phrase in text for phrase in TRIGGER_PHRASES):
                        results.append({
                            "reddit_post_id": post.id,
                            "subreddit": sub_name,
                            "title": post.title[:500],
                            "body": post.selftext[:2000],
                            "author": str(post.author) if post.author else "",
                            "url": f"https://reddit.com{post.permalink}",
                            "posted_at": created,
                        })
            except Exception as e:
                logger.warning(f"[reddit] Error fetching r/{sub_name}: {e}")
        return results

    raw_posts = await loop.run_in_executor(None, _fetch)

    # Save to DB and filter already-processed posts
    saved = []
    for p in raw_posts:
        async with db.get_conn() as conn:
            existing = await conn.fetchval(
                "SELECT id FROM reddit_posts WHERE workspace_id = $1 AND reddit_post_id = $2",
                workspace_id, p["reddit_post_id"],
            )
            if existing:
                continue
            row = await conn.fetchrow(
                """
                INSERT INTO reddit_posts
                    (workspace_id, reddit_post_id, subreddit, title, body, author, url,
                     action_taken, posted_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8)
                RETURNING id
                """,
                workspace_id, p["reddit_post_id"], p["subreddit"], p["title"],
                p["body"], p["author"], p["url"], p["posted_at"],
            )
        saved.append({**p, "db_id": row["id"]})

    return saved


async def _post_comment(workspace_id: UUID, post: dict, workspace: dict):
    try:
        comment_text, _ = await claude_client.write_reddit_comment(post, workspace)

        loop = asyncio.get_event_loop()

        def _post():
            reddit = _get_reddit_client()
            submission = reddit.submission(id=post["reddit_post_id"])
            comment = submission.reply(comment_text)
            return comment.id

        comment_id = await loop.run_in_executor(None, _post)

        async with db.get_conn() as conn:
            await conn.execute(
                """
                INSERT INTO reddit_actions
                    (workspace_id, post_id, action_type, content, reddit_author, reddit_comment_id)
                VALUES ($1,$2,'comment',$3,$4,$5)
                """,
                workspace_id, post["db_id"], comment_text, post["author"], comment_id,
            )
            await conn.execute(
                "UPDATE reddit_posts SET action_taken = 'commented' WHERE id = $1", post["db_id"]
            )
        logger.info(f"[reddit] Commented on {post['reddit_post_id']} in r/{post['subreddit']}")
    except Exception as e:
        logger.error(f"[reddit] Comment failed on {post['reddit_post_id']}: {e}")


async def _send_dm(workspace_id: UUID, post: dict, workspace: dict):
    if not post["author"]:
        return
    try:
        dm_text, _ = await claude_client.write_reddit_dm(post, workspace)

        loop = asyncio.get_event_loop()

        def _send():
            reddit = _get_reddit_client()
            subject = f"Re: {post['title'][:50]}"
            reddit.redditor(post["author"]).message(subject=subject, message=dm_text)

        await loop.run_in_executor(None, _send)

        async with db.get_conn() as conn:
            await conn.execute(
                """
                INSERT INTO reddit_actions
                    (workspace_id, post_id, action_type, content, reddit_author)
                VALUES ($1,$2,'dm',$3,$4)
                """,
                workspace_id, post["db_id"], dm_text, post["author"],
            )
            await conn.execute(
                "UPDATE reddit_posts SET action_taken = 'dm_sent' WHERE id = $1", post["db_id"]
            )
        logger.info(f"[reddit] DM sent to u/{post['author']}")
    except Exception as e:
        logger.error(f"[reddit] DM failed to {post.get('author')}: {e}")


async def enrich_reddit_lead(workspace_id: UUID, reddit_author: str, company: str | None = None) -> dict | None:
    """
    Find email for a Reddit user who engaged with us.
    Called after a reply to our comment/DM is detected.
    """
    if not company:
        return None

    client = SearchLeadsClient()
    # Try to extract name from Reddit username (best effort)
    name_parts = reddit_author.replace("_", " ").split()
    if len(name_parts) < 2:
        return None

    result = await client.find_email(
        first_name=name_parts[0],
        last_name=name_parts[-1],
        company=company,
    )
    if not result or not result.get("email"):
        return None

    email = result["email"]
    async with db.get_tx() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM leads WHERE workspace_id = $1 AND email = $2",
            workspace_id, email,
        )
        if existing:
            return {"lead_id": str(existing), "email": email, "status": "already_exists"}

        lead_id = await conn.fetchval(
            """
            INSERT INTO leads
                (workspace_id, email, first_name, last_name, company, source, reddit_context)
            VALUES ($1,$2,$3,$4,$5,'reddit',$6)
            RETURNING id
            """,
            workspace_id,
            email,
            name_parts[0],
            name_parts[-1],
            company,
            json.dumps({"reddit_username": reddit_author}),
        )

    logger.info(f"[reddit] Warm lead created: {email} from u/{reddit_author}")
    return {"lead_id": str(lead_id), "email": email, "status": "created"}
