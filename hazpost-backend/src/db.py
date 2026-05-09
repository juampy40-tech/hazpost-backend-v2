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

            # 🔴 POSTS — Persistencia real + numeración por usuario
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS posts (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    business_id TEXT,
                    post_number INTEGER,
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
                CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_user_post_number
                ON posts (user_id, post_number)
                WHERE post_number IS NOT NULL;
            """))

            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_posts_status
                ON posts (status);
            """))

            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_posts_business_id
                ON posts (business_id);
            """))

            # 🏢 BUSINESSES — Fuente única de verdad multi-negocio
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS businesses (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    name TEXT NOT NULL DEFAULT 'Mi negocio',
                    industry TEXT,
                    sub_industry TEXT,
                    city TEXT,
                    country TEXT,
                    timezone TEXT,
                    slogan TEXT,
                    description TEXT,
                    audience TEXT,
                    tone TEXT,
                    logo_url TEXT,
                    logo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
                    primary_color TEXT,
                    secondary_color TEXT,
                    website TEXT,
                    is_default BOOLEAN NOT NULL DEFAULT FALSE,
                    data JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """))

            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_businesses_user_id
                ON businesses (user_id);
            """))

            db.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_one_default_per_user
                ON businesses (user_id)
                WHERE is_default = TRUE;
            """))

            # 🟣 TEXT BLOCKS
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS text_blocks (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    block_id TEXT NOT NULL,
                    data JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """))

            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_text_blocks_user_id
                ON text_blocks (user_id);
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

def migrate_anonymous_brand_profile(target_user_id):
    """
    Migra brand profile anonymous → usuario real
    SOLO si el usuario real todavía no tiene perfil válido.
    """
    if not target_user_id:
        return None

    target_user_id = str(target_user_id).strip().lower()

    if target_user_id == "anonymous":
        return None

    current = get_brand_profile(target_user_id)

    current_is_valid = (
        isinstance(current, dict)
        and current.get("companyName") not in [None, "", "Mi negocio"]
        and (
            current.get("industry")
            or current.get("businessDescription")
            or current.get("logoUrl")
            or current.get("website")
        )
    )

    if current_is_valid:
        return current

    anonymous = get_brand_profile("anonymous")

    if not anonymous:
        return None

    logger.info(f"MIGRANDO BRAND PROFILE anonymous → {target_user_id}")

    save_brand_profile(target_user_id, anonymous)

    return get_brand_profile(target_user_id)

# ================================
# BUSINESSES — Fuente única de verdad 
# ================================

def _business_from_profile(profile):
    if not isinstance(profile, dict):
        profile = {}

    name = (
        profile.get("companyName")
        or profile.get("name")
        or "Mi negocio"
    )

    return {
        "name": name,
        "industry": profile.get("industry"),
        "sub_industry": profile.get("subIndustry"),
        "city": profile.get("city"),
        "country": profile.get("country"),
        "timezone": profile.get("timezone"),
        "slogan": profile.get("slogan"),
        "description": profile.get("businessDescription") or profile.get("description"),
        "audience": profile.get("audience") or profile.get("targetAudience") or profile.get("audienceDescription"),
        "tone": profile.get("brandTone") or profile.get("tone"),
        "logo_url": profile.get("logoUrl"),
        "logo_urls": profile.get("logoUrls") or [],
        "primary_color": profile.get("primaryColor"),
        "secondary_color": profile.get("secondaryColor"),
        "website": profile.get("website"),
        "data": profile,
    }


def _business_row_to_dict(row):
    if not row:
        return None

    data = row.get("data") or {}
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            data = {}

    business = {
        "id": row.get("id"),
        "userId": row.get("user_id"),
        "name": row.get("name"),
        "companyName": row.get("name"),
        "industry": row.get("industry"),
        "subIndustry": row.get("sub_industry"),
        "city": row.get("city"),
        "country": row.get("country"),
        "timezone": row.get("timezone"),
        "slogan": row.get("slogan"),
        "businessDescription": row.get("description"),
        "description": row.get("description"),
        "audience": row.get("audience"),
        "brandTone": row.get("tone"),
        "tone": row.get("tone"),
        "logoUrl": row.get("logo_url"),
        "logoUrls": row.get("logo_urls") or [],
        "primaryColor": row.get("primary_color"),
        "secondaryColor": row.get("secondary_color"),
        "website": row.get("website"),
        "isDefault": bool(row.get("is_default")),
        "createdAt": row.get("created_at").isoformat() if row.get("created_at") else None,
        "updatedAt": row.get("updated_at").isoformat() if row.get("updated_at") else None,
    }

    if isinstance(data, dict):
        business = {**data, **business}

    return business


def get_businesses(user_id):
    if not user_id:
        return []

    with db_session() as db:
        rows = db.execute(text("""
            SELECT *
            FROM businesses
            WHERE user_id = :user_id
            ORDER BY is_default DESC, created_at ASC;
        """), {"user_id": str(user_id)}).mappings().all()

    return [_business_row_to_dict(row) for row in rows]


def get_default_business(user_id):
    if not user_id:
        return None

    with db_session() as db:
        row = db.execute(text("""
            SELECT *
            FROM businesses
            WHERE user_id = :user_id
              AND is_default = TRUE
            LIMIT 1;
        """), {"user_id": str(user_id)}).mappings().first()

    return _business_row_to_dict(row)


def ensure_default_business_from_brand_profile(user_id):
    if not user_id:
        return None

    existing = get_businesses(user_id)
    if existing:
        return existing[0]

    profile = get_brand_profile(user_id)
    if not profile:
        return None

    payload = _business_from_profile(profile)
    return create_business(user_id, payload, is_default=True)


def create_business(user_id, data, is_default=False):
    if not user_id:
        raise ValueError("user_id es requerido")

    if not isinstance(data, dict):
        data = {}

    payload = _business_from_profile(data)

    with db_session() as db:
        if is_default:
            db.execute(text("""
                UPDATE businesses
                SET is_default = FALSE,
                    updated_at = NOW()
                WHERE user_id = :user_id;
            """), {"user_id": str(user_id)})

        row = db.execute(text("""
            INSERT INTO businesses (
                user_id, name, industry, sub_industry, city, country, timezone,
                slogan, description, audience, tone,
                logo_url, logo_urls, primary_color, secondary_color,
                website, is_default, data, updated_at
            )
            VALUES (
                :user_id, :name, :industry, :sub_industry, :city, :country,
                :slogan, :description, :audience, :tone,
                :logo_url, CAST(:logo_urls AS JSONB), :primary_color, :secondary_color,
                :website, :is_default, CAST(:data AS JSONB), NOW()
            )
            RETURNING *;
        """), {
            "user_id": str(user_id),
            "name": payload["name"],
            "industry": payload["industry"],
            "sub_industry": payload["sub_industry"],
            "city": payload["city"],
            "country": payload["country"],
            "slogan": payload["slogan"],
            "description": payload["description"],
            "audience": payload["audience"],
            "tone": payload["tone"],
            "logo_url": payload["logo_url"],
            "logo_urls": json.dumps(payload["logo_urls"], ensure_ascii=False),
            "primary_color": payload["primary_color"],
            "secondary_color": payload["secondary_color"],
            "website": payload["website"],
            "is_default": bool(is_default),
            "data": json.dumps(data, ensure_ascii=False),
        }).mappings().first()

    return _business_row_to_dict(row)


def set_default_business(user_id, business_id):
    if not user_id or not business_id:
        return None

    with db_session() as db:
        target = db.execute(text("""
            SELECT *
            FROM businesses
            WHERE user_id = :user_id
              AND id = :business_id
            LIMIT 1;
        """), {
            "user_id": str(user_id),
            "business_id": int(business_id),
        }).mappings().first()

        if not target:
            return None

        db.execute(text("""
            UPDATE businesses
            SET is_default = FALSE,
                updated_at = NOW()
            WHERE user_id = :user_id;
        """), {"user_id": str(user_id)})

        row = db.execute(text("""
            UPDATE businesses
            SET is_default = TRUE,
                updated_at = NOW()
            WHERE user_id = :user_id
              AND id = :business_id
            RETURNING *;
        """), {
            "user_id": str(user_id),
            "business_id": int(business_id),
        }).mappings().first()

    return _business_row_to_dict(row)

def get_business(user_id, business_id):
    if not user_id or not business_id:
        return None

    with db_session() as db:
        row = db.execute(text("""
            SELECT *
            FROM businesses
            WHERE user_id = :user_id
              AND id = :business_id
            LIMIT 1;
        """), {
            "user_id": str(user_id),
            "business_id": int(business_id),
        }).mappings().first()

    return _business_row_to_dict(row)


def update_business(user_id, business_id, data):
    if not user_id:
        raise ValueError("user_id es requerido")

    if not business_id:
        raise ValueError("business_id es requerido")

    if not isinstance(data, dict):
        data = {}

    current = get_business(user_id, business_id)
    if not current:
        return None

    merged = {**current, **data}
    payload = _business_from_profile(merged)

    with db_session() as db:
        row = db.execute(text("""
            UPDATE businesses
            SET name = :name,
                industry = :industry,
                sub_industry = :sub_industry,
                city = :city,
                country = :country,
                slogan = :slogan,
                description = :description,
                audience = :audience,
                tone = :tone,
                logo_url = :logo_url,
                logo_urls = CAST(:logo_urls AS JSONB),
                primary_color = :primary_color,
                secondary_color = :secondary_color,
                website = :website,
                data = CAST(:data AS JSONB),
                updated_at = NOW()
            WHERE user_id = :user_id
              AND id = :business_id
            RETURNING *;
        """), {
            "user_id": str(user_id),
            "business_id": int(business_id),
            "name": payload["name"],
            "industry": payload["industry"],
            "sub_industry": payload["sub_industry"],
            "city": payload["city"],
            "country": payload["country"],
            "slogan": payload["slogan"],
            "description": payload["description"],
            "audience": payload["audience"],
            "tone": payload["tone"],
            "logo_url": payload["logo_url"],
            "logo_urls": json.dumps(payload["logo_urls"], ensure_ascii=False),
            "primary_color": payload["primary_color"],
            "secondary_color": payload["secondary_color"],
            "website": payload["website"],
            "data": json.dumps(merged, ensure_ascii=False),
        }).mappings().first()

    return _business_row_to_dict(row)


def delete_business(user_id, business_id):
    if not user_id or not business_id:
        return None

    businesses = get_businesses(user_id)
    if len(businesses) <= 1:
        raise ValueError("No puedes borrar el único negocio del usuario")

    with db_session() as db:
        row = db.execute(text("""
            DELETE FROM businesses
            WHERE user_id = :user_id
              AND id = :business_id
            RETURNING *;
        """), {
            "user_id": str(user_id),
            "business_id": int(business_id),
        }).mappings().first()

    deleted = _business_row_to_dict(row)

    remaining = get_businesses(user_id)
    has_default = any(b.get("isDefault") for b in remaining)

    if remaining and not has_default:
        set_default_business(user_id, remaining[0]["id"])

    return deleted


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

# ================================
# TEXT BLOCKS (NUEVO)
# ================================

def get_text_blocks(user_id):
    if not user_id:
        return []

    with db_session() as db:
        rows = db.execute(text("""
            SELECT data
            FROM text_blocks
            WHERE user_id = :user_id
              AND COALESCE((data->>'active')::boolean, true) = true
            ORDER BY created_at ASC
        """), {"user_id": str(user_id)}).mappings().all()

    return [r["data"] for r in rows]


def save_text_block(user_id, block):
    if not user_id:
        raise ValueError("user_id es requerido")

    if not isinstance(block, dict):
        raise ValueError("block debe ser un diccionario")

    block_id = block.get("id") or block.get("block_id")
    if not block_id:
        raise ValueError("block.id es requerido")

    with db_session() as db:
        db.execute(text("""
            DELETE FROM text_blocks
            WHERE user_id = :user_id
              AND block_id = :block_id;
        """), {
            "user_id": str(user_id),
            "block_id": str(block_id),
        })

        db.execute(text("""
            INSERT INTO text_blocks (user_id, block_id, data)
            VALUES (:user_id, :block_id, CAST(:data AS JSONB));
        """), {
            "user_id": str(user_id),
            "block_id": str(block_id),
            "data": json.dumps(block, ensure_ascii=False),
        })

    return block
