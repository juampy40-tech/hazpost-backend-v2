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

            # 🔵 TABLA EXISTENTE (NO TOCAR)
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS brand_profiles (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL UNIQUE,
                    profile JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """))

            # 🔴 NUEVA TABLA POSTS (CLAVE)
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS posts (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    business_id TEXT,
                    post JSONB NOT NULL DEFAULT '{}'::jsonb,
                    status TEXT NOT NULL DEFAULT 'pending_approval',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """))

            # ⚡ ÍNDICES (performance)
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_posts_user_id
                ON posts (user_id);
            """))

            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_posts_status
                ON posts (status);
            """))

            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_posts_business_id
                ON posts (business_id);
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


# ================================
# POSTS (NUEVO - PERSISTENCIA REAL)
# ================================

def save_post(user_id, post, business_id=None, status=None):
    if not user_id:
        raise ValueError("user_id es requerido")

    if not isinstance(post, dict):
        raise ValueError("post debe ser un diccionario")

    post_status = status or post.get("status") or "pending_approval"
    post_business_id = business_id or post.get("businessId") or post.get("business_id")

    with db_session() as db:

        # 🔢 Obtener siguiente número de post por usuario
        next_post_number_row = db.execute(
            text("""
                SELECT COALESCE(MAX(post_number), 0) + 1 AS next_number
                FROM posts
                WHERE user_id = :user_id;
            """),
            {"user_id": str(user_id)}
        ).mappings().first()

        next_post_number = next_post_number_row.get("next_number", 1)

        # 💾 Insertar post con post_number
        row = db.execute(
            text("""
                INSERT INTO posts (user_id, business_id, post, status, post_number, updated_at)
                VALUES (:user_id, :business_id, CAST(:post AS JSONB), :status, :post_number, NOW())
                RETURNING id, post, status, business_id, post_number, created_at, updated_at;
            """),
            {
                "user_id": str(user_id),
                "business_id": str(post_business_id) if post_business_id is not None else None,
                "post": json.dumps(post, ensure_ascii=False),
                "status": str(post_status),
                "post_number": int(next_post_number),
            }
        ).mappings().first()

    saved_post = row.get("post") or {}

    if isinstance(saved_post, str):
        try:
            saved_post = json.loads(saved_post)
        except Exception:
            saved_post = {}

    if not isinstance(saved_post, dict):
        saved_post = {}

    # 🔑 Campos base
    saved_post["id"] = row.get("id")
    saved_post["status"] = row.get("status") or post_status

    # 🔢 NUEVO: número de post
    saved_post["postNumber"] = row.get("post_number") or row.get("id")

    if row.get("business_id") is not None:
        saved_post["businessId"] = row.get("business_id")

    saved_post["createdAt"] = row.get("created_at").isoformat() if row.get("created_at") else None
    saved_post["updatedAt"] = row.get("updated_at").isoformat() if row.get("updated_at") else None

    return saved_post

def get_posts(user_id, status=None, business_id=None, slim=False):
    if not user_id:
        return []

    conditions = ["user_id = :user_id"]
    params = {"user_id": str(user_id)}

    if status:
        statuses = [s.strip() for s in str(status).split(",") if s.strip()]
        if statuses:
            conditions.append("status = ANY(:statuses)")
            params["statuses"] = statuses

    if business_id:
        conditions.append("business_id = :business_id")
        params["business_id"] = str(business_id)

    where_sql = " AND ".join(conditions)

    with db_session() as db:
        rows = db.execute(
            text(f"""
                SELECT id, post, status, business_id, post_number, created_at, updated_at
                FROM posts
                WHERE {where_sql}
                ORDER BY created_at DESC;
            """),
            params
        ).mappings().all()

    posts = []

    for row in rows:
        post = row.get("post") or {}

        if isinstance(post, str):
            try:
                post = json.loads(post)
            except Exception:
                post = {}

        if not isinstance(post, dict):
            post = {}

        post["id"] = row.get("id")
        post["postNumber"] = row.get("post_number") or row.get("id")
        post["status"] = row.get("status")

        if row.get("business_id") is not None:
            post["businessId"] = row.get("business_id")

        post["createdAt"] = row.get("created_at").isoformat() if row.get("created_at") else None
        post["updatedAt"] = row.get("updated_at").isoformat() if row.get("updated_at") else None

        if slim:
            posts.append({
                "id": post.get("id"),
                "status": post.get("status"),
                "postNumber": post.get("postNumber"),
            })
        else:
            posts.append(post)

    return posts

def update_post_status(user_id, post_id, status, extra_updates=None):
    if not user_id:
        raise ValueError("user_id es requerido")

    if not post_id:
        raise ValueError("post_id es requerido")

    updates = extra_updates if isinstance(extra_updates, dict) else {}

    with db_session() as db:
        row = db.execute(
            text("""
                SELECT post
                FROM posts
                WHERE id = :post_id AND user_id = :user_id
                LIMIT 1;
            """),
            {
                "post_id": int(post_id),
                "user_id": str(user_id),
            }
        ).mappings().first()

        if not row:
            return None

        post = row.get("post") or {}

        if isinstance(post, str):
            try:
                post = json.loads(post)
            except Exception:
                post = {}

        if not isinstance(post, dict):
            post = {}

        post.update(updates)
        post["status"] = status

        updated = db.execute(
            text("""
                UPDATE posts
                SET post = CAST(:post AS JSONB),
                    status = :status,
                    updated_at = NOW()
                WHERE id = :post_id AND user_id = :user_id
                RETURNING id, post, status, business_id, post_number, created_at, updated_at;
            """),
            {
                "post_id": int(post_id),
                "user_id": str(user_id),
                "post": json.dumps(post, ensure_ascii=False),
                "status": str(status),
            }
        ).mappings().first()

    saved_post = updated.get("post") or {}

    if isinstance(saved_post, str):
        try:
            saved_post = json.loads(saved_post)
        except Exception:
            saved_post = {}

    if not isinstance(saved_post, dict):
        saved_post = {}

    saved_post["id"] = updated.get("id")
    saved_post["status"] = updated.get("status")

    # 🔢 IMPORTANTE
    saved_post["postNumber"] = updated.get("post_number") or updated.get("id")

    saved_post["businessId"] = updated.get("business_id")
    saved_post["createdAt"] = updated.get("created_at").isoformat() if updated.get("created_at") else None
    saved_post["updatedAt"] = updated.get("updated_at").isoformat() if updated.get("updated_at") else None

    return saved_post

def update_post_fields(user_id, post_id, updates):
    if not user_id:
        raise ValueError("user_id es requerido")

    if not post_id:
        raise ValueError("post_id es requerido")

    if not isinstance(updates, dict):
        raise ValueError("updates debe ser un diccionario")

    with db_session() as db:
        row = db.execute(
            text("""
                SELECT post, status
                FROM posts
                WHERE id = :post_id AND user_id = :user_id
                LIMIT 1;
            """),
            {
                "post_id": int(post_id),
                "user_id": str(user_id),
            }
        ).mappings().first()

        if not row:
            return None

        post = row.get("post") or {}

        if isinstance(post, str):
            try:
                post = json.loads(post)
            except Exception:
                post = {}

        if not isinstance(post, dict):
            post = {}

        post.update(updates)

        new_status = updates.get("status") or row.get("status") or post.get("status") or "pending_approval"
        post["status"] = new_status

        updated = db.execute(
            text("""
                UPDATE posts
                SET post = CAST(:post AS JSONB),
                    status = :status,
                    updated_at = NOW()
                WHERE id = :post_id AND user_id = :user_id
                RETURNING id, post, status, business_id, post_number, created_at, updated_at;
            """),
            {
                "post_id": int(post_id),
                "user_id": str(user_id),
                "post": json.dumps(post, ensure_ascii=False),
                "status": str(new_status),
            }
        ).mappings().first()

    saved_post = updated.get("post") or {}

    if isinstance(saved_post, str):
        try:
            saved_post = json.loads(saved_post)
        except Exception:
            saved_post = {}

    if not isinstance(saved_post, dict):
        saved_post = {}

    saved_post["id"] = updated.get("id")
    saved_post["status"] = updated.get("status")

    # 🔢 IMPORTANTE
    saved_post["postNumber"] = updated.get("post_number") or updated.get("id")
    
    saved_post["businessId"] = updated.get("business_id")
    saved_post["createdAt"] = updated.get("created_at").isoformat() if updated.get("created_at") else None
    saved_post["updatedAt"] = updated.get("updated_at").isoformat() if updated.get("updated_at") else None

    return saved_post
