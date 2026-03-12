import csv
import io
import json
import re
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
import db

router = APIRouter()

# Fields we can import from CSV
IMPORTABLE_FIELDS = [
    "email", "first_name", "last_name", "company", "title",
    "linkedin_url", "website", "industry", "company_size", "location",
]


@router.get("/{workspace_id}")
async def list_leads(
    workspace_id: UUID,
    status: str | None = Query(None),
    limit: int = Query(50, le=500),
    offset: int = Query(0),
):
    async with db.get_conn() as conn:
        if status:
            rows = await conn.fetch(
                """
                SELECT l.*, ls.total_score
                FROM leads l
                LEFT JOIN lead_scores ls ON ls.lead_id = l.id
                WHERE l.workspace_id = $1 AND l.status = $2
                ORDER BY l.created_at DESC
                LIMIT $3 OFFSET $4
                """,
                workspace_id, status, limit, offset,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT l.*, ls.total_score
                FROM leads l
                LEFT JOIN lead_scores ls ON ls.lead_id = l.id
                WHERE l.workspace_id = $1
                ORDER BY l.created_at DESC
                LIMIT $2 OFFSET $3
                """,
                workspace_id, limit, offset,
            )
    return [dict(r) for r in rows]


@router.get("/{workspace_id}/{lead_id}")
async def get_lead(workspace_id: UUID, lead_id: UUID):
    async with db.get_conn() as conn:
        lead = await conn.fetchrow(
            "SELECT * FROM leads WHERE id = $1 AND workspace_id = $2",
            lead_id, workspace_id,
        )
        if not lead:
            raise HTTPException(404, "Lead not found")

        research = await conn.fetchrow(
            "SELECT * FROM lead_research WHERE lead_id = $1", lead_id
        )
        score = await conn.fetchrow(
            "SELECT * FROM lead_scores WHERE lead_id = $1 ORDER BY scored_at DESC LIMIT 1",
            lead_id,
        )
        variants = await conn.fetchrow(
            "SELECT * FROM email_variants WHERE lead_id = $1", lead_id
        )
        send = await conn.fetchrow(
            "SELECT * FROM email_sends WHERE lead_id = $1 ORDER BY sent_at DESC LIMIT 1",
            lead_id,
        )
        perf = await conn.fetchrow(
            """
            SELECT ep.* FROM email_performance ep
            JOIN email_sends es ON ep.send_id = es.id
            WHERE es.lead_id = $1
            ORDER BY ep.synced_at DESC LIMIT 1
            """,
            lead_id,
        )

    return {
        "lead": dict(lead),
        "research": dict(research) if research else None,
        "score": dict(score) if score else None,
        "variants": dict(variants) if variants else None,
        "send": dict(send) if send else None,
        "performance": dict(perf) if perf else None,
    }


@router.get("/{workspace_id}/pipeline/counts")
async def pipeline_counts(workspace_id: UUID):
    async with db.get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT status, count(*) as count
            FROM leads WHERE workspace_id = $1
            GROUP BY status ORDER BY status
            """,
            workspace_id,
        )
    return {r["status"]: r["count"] for r in rows}


# ============================================================
# CSV IMPORT
# ============================================================

@router.post("/{workspace_id}/csv-preview")
async def csv_preview(
    workspace_id: UUID,
    file: UploadFile = File(...),
):
    """
    Parse a CSV and return its headers + first 5 rows for column mapping.
    Also attempts auto-mapping common column name patterns.
    """
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    headers = reader.fieldnames or []
    rows = []
    for i, row in enumerate(reader):
        if i >= 5:
            break
        rows.append(dict(row))

    # Auto-detect common column name patterns
    auto_mapping: dict[str, str] = {}
    patterns: dict[str, list[str]] = {
        "email":        ["email", "e-mail", "emailaddress", "email address", "mail"],
        "first_name":   ["first_name", "first name", "firstname", "vorname", "givenname", "given name"],
        "last_name":    ["last_name", "last name", "lastname", "nachname", "surname", "family name"],
        "company":      ["company", "company name", "organization", "organisation", "firm", "account"],
        "title":        ["title", "job title", "jobtitle", "position", "role", "function"],
        "linkedin_url": ["linkedin", "linkedin url", "linkedin_url", "profile url", "linkedin profile"],
        "website":      ["website", "url", "web", "domain", "company website"],
        "industry":     ["industry", "sector", "vertical"],
        "company_size": ["company size", "employees", "headcount", "size", "company_size"],
        "location":     ["location", "country", "city", "region", "land", "staat"],
    }
    for field, aliases in patterns.items():
        for header in headers:
            if header.lower().strip() in aliases:
                auto_mapping[field] = header
                break

    return {
        "headers": headers,
        "preview": rows,
        "auto_mapping": auto_mapping,
        "importable_fields": IMPORTABLE_FIELDS,
    }


@router.post("/{workspace_id}/import-csv")
async def import_csv(
    workspace_id: UUID,
    file: UploadFile = File(...),
    mapping: str = Form(...),  # JSON: {"email": "Email Col", "first_name": "First Name Col", ...}
):
    """
    Import leads from CSV. mapping is a JSON object mapping our field names to CSV column headers.
    email is the only required field. Skips rows with invalid/duplicate emails.
    Returns: {imported, skipped, errors}
    """
    col_map: dict[str, str] = json.loads(mapping)
    if "email" not in col_map:
        raise HTTPException(400, "email column mapping is required")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    imported = 0
    skipped = 0
    errors: list[str] = []

    _email_re = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

    async with db.get_tx() as conn:
        # Fetch existing emails for dedup
        existing = set(
            r["email"] for r in await conn.fetch(
                "SELECT email FROM leads WHERE workspace_id = $1", workspace_id
            )
        )

        for row_num, row in enumerate(reader, start=2):
            email = (row.get(col_map["email"]) or "").strip().lower()
            if not email or not _email_re.match(email):
                skipped += 1
                continue
            if email in existing:
                skipped += 1
                continue

            lead = {
                "workspace_id": workspace_id,
                "email": email,
                "source": "csv",
            }
            for field in IMPORTABLE_FIELDS:
                if field == "email":
                    continue
                csv_col = col_map.get(field)
                if csv_col and csv_col in row:
                    val = (row[csv_col] or "").strip()
                    if val:
                        lead[field] = val

            try:
                await conn.execute(
                    """
                    INSERT INTO leads (workspace_id, email, first_name, last_name, company,
                        title, linkedin_url, website, industry, company_size, location, source)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                    """,
                    lead.get("workspace_id"), lead.get("email"),
                    lead.get("first_name"), lead.get("last_name"), lead.get("company"),
                    lead.get("title"), lead.get("linkedin_url"), lead.get("website"),
                    lead.get("industry"), lead.get("company_size"), lead.get("location"),
                    "csv",
                )
                existing.add(email)
                imported += 1
            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)[:80]}")
                skipped += 1

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors[:10],  # cap error list
    }
