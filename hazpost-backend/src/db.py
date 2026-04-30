import os
import json
import logging
from contextlib import contextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")

engine = None

if DATABASE_URL:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
        future=True,
    )
else:
    logger.warning("DATABASE_URL no está configurada. PostgreSQL no estará disponible.")


def db_available():
    return engine is not None


@contextmanager
def db_session():
    if engine is None:
        raise RuntimeError("DATABASE_URL no está configurada")

    with engine.begin() as connection:
        yield connection


def init_db():
    if engine is None:
        logger.warning("Saltando init_db: DATABASE_URL no configurada")
        return False

    try:
        with db_session() as db:
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS brand_profiles (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL UNIQUE,
                    profile JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """))

        logger.info("Base de datos inicializada correctamente")
        return True

    except SQLAlchemyError as e:
        logger.exception("Error inicializando base de datos: %s", e)
        return False


def save_brand_profile(user_id, profile):
    if not user_id:
        raise ValueError("user_id es requerido")

    if not isinstance(profile, dict):
        raise ValueError("profile debe ser un diccionario")

    with db_session() as db:
        db.execute(
            text("""
                INSERT INTO brand_profiles (user_id, profile, updated_at)
                VALUES (:user_id, CAST(:profile AS JSONB), NOW())
                ON CONFLICT (user_id)
                DO UPDATE SET
                    profile = EXCLUDED.profile,
                    updated_at = NOW();
            """),
            {
                "user_id": str(user_id),
                "profile": json.dumps(profile, ensure_ascii=False),
            }
        )

    return profile


def get_brand_profile(user_id):
    if not user_id:
        return {}

    with db_session() as db:
        row = db.execute(
            text("""
                SELECT profile
                FROM brand_profiles
                WHERE user_id = :user_id
                LIMIT 1;
            """),
            {"user_id": str(user_id)}
        ).mappings().first()

    if not row:
        return {}

    profile = row.get("profile") or {}

    if isinstance(profile, str):
        try:
            return json.loads(profile)
        except Exception:
            return {}

    return profile if isinstance(profile, dict) else {}
