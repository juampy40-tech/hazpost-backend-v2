from datetime import datetime
from sqlalchemy import text

from src.db import db_session


def save_industry_suggestion(
    name: str,
    user_id: str | None = None,
    business_id: str | None = None,
    suggestion_type: str = "industry",
    parent_industry: str | None = None,
):
    clean_name = (name or "").strip()

    if not clean_name:
        return {"status": "invalid"}

    normalized_name = clean_name.lower().strip()

    clean_type = (
        suggestion_type
        if suggestion_type in ["industry", "subindustry"]
        else "industry"
    )

    clean_parent = (
        (parent_industry or "").strip()
        if clean_type == "subindustry"
        else None
    )

    with db_session() as db:
        existing = db.execute(text("""
            SELECT id
            FROM industry_suggestions
            WHERE type = :type
              AND COALESCE(parent_industry, '') = COALESCE(:parent_industry, '')
              AND normalized_name = :normalized_name
            LIMIT 1;
        """), {
            "type": clean_type,
            "parent_industry": clean_parent,
            "normalized_name": normalized_name,
        }).mappings().first()

        if existing:
            db.execute(text("""
                UPDATE industry_suggestions
                SET request_count = request_count + 1,
                    updated_at = NOW()
                WHERE type = :type
                  AND COALESCE(parent_industry, '') = COALESCE(:parent_industry, '')
                  AND normalized_name = :normalized_name;
            """), {
                "type": clean_type,
                "parent_industry": clean_parent,
                "normalized_name": normalized_name,
            })

            return {"status": "exists"}

        db.execute(text("""
            INSERT INTO industry_suggestions (
                name,
                normalized_name,
                type,
                parent_industry,
                status,
                source,
                user_id,
                business_id,
                created_at,
                updated_at
            )
            VALUES (
                :name,
                :normalized_name,
                :type,
                :parent_industry,
                'pending',
                'onboarding',
                :user_id,
                :business_id,
                NOW(),
                NOW()
            );
        """), {
            "name": clean_name,
            "normalized_name": normalized_name,
            "type": clean_type,
            "parent_industry": clean_parent,
            "user_id": str(user_id) if user_id else None,
            "business_id": str(business_id) if business_id else None,
        })

    return {
        "status": "saved",
        "type": clean_type,
        "parentIndustry": clean_parent,
        "createdAt": datetime.utcnow().isoformat()
    }