from datetime import datetime
from sqlalchemy import text

from src.db import db_session


def save_industry_suggestion(
    name: str,
    user_id: str | None = None,
    business_id: str | None = None,
):
    clean_name = (name or "").strip()

    if not clean_name:
        return {"status": "invalid"}

    normalized_name = clean_name.lower()

    with db_session() as db:

        existing = db.execute(text("""
            SELECT id
            FROM industry_suggestions
            WHERE normalized_name = :normalized_name
            LIMIT 1;
        """), {
            "normalized_name": normalized_name,
        }).mappings().first()

        if existing:
            with db_session() as db:
                db.execute(text("""
                    UPDATE industry_suggestions
                    SET request_count = request_count + 1,
                        updated_at = NOW()
                    WHERE normalized_name = :normalized_name;
                """), {
                    "normalized_name": normalized_name
                })

            return {"status": "exists"}

        db.execute(text("""
            INSERT INTO industry_suggestions (
                name,
                normalized_name,
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
            "user_id": str(user_id) if user_id else None,
            "business_id": str(business_id) if business_id else None,
        })

    return {
        "status": "saved",
        "createdAt": datetime.utcnow().isoformat()
    }