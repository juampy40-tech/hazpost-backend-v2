import uuid
import os
import json
import time
import requests
import boto3
import replicate

from flask import Blueprint, jsonify, request, session
from sqlalchemy import text

from src.db import (
    db_available,
    db_session,
    get_posts,
    save_post,
    update_post_fields,
    update_post_status
)

from src.image_variants import (
    normalize_variants,
    create_overlay_variant,
    select_variant,
    delete_variant,
    reorder_variants,
)

dashboard_bp = Blueprint('dashboard', __name__)


def _as_list(value):
    return value if isinstance(value, list) else []


def _get_dashboard_user_id():
    user = session.get("user") or {}

    user_id = (
        user.get("email")
        or user.get("id")
        or session.get("user_id")
        or session.get("userId")
    )

    if not user_id:
        return None  # 🔥 importante

    return str(user_id).strip().lower()

META_GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v25.0")
META_GRAPH_BASE = f"https://graph.facebook.com/{META_GRAPH_VERSION}"

def _ensure_social_defaults_table():
    if not db_available():
        return False

    with db_session() as db:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS user_social_defaults (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                social_account_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, platform)
            );
        """))

    return True


def _set_default_social_account(user_id, platform, social_account_id):
    _ensure_social_defaults_table()

    with db_session() as db:
        row = db.execute(text("""
            INSERT INTO user_social_defaults (
                user_id,
                platform,
                social_account_id,
                updated_at
            )
            VALUES (
                :user_id,
                :platform,
                :social_account_id,
                NOW()
            )
            ON CONFLICT (user_id, platform)
            DO UPDATE SET
                social_account_id = EXCLUDED.social_account_id,
                updated_at = NOW()
            RETURNING social_account_id;
        """), {
            "user_id": str(user_id),
            "platform": str(platform),
            "social_account_id": int(social_account_id),
        }).mappings().first()

    return row


def _get_default_social_account_id(user_id, platform):
    _ensure_social_defaults_table()

    with db_session() as db:
        row = db.execute(text("""
            SELECT social_account_id
            FROM user_social_defaults
            WHERE user_id = :user_id
              AND platform = :platform
            LIMIT 1;
        """), {
            "user_id": str(user_id),
            "platform": str(platform),
        }).mappings().first()

    return row.get("social_account_id") if row else None


def _get_instagram_social_account(user_id, social_account_id=None):
    if not db_available():
        return None

    if not social_account_id:
        social_account_id = _get_default_social_account_id(user_id, "instagram")

    with db_session() as db:
        if social_account_id:
            row = db.execute(text("""
                SELECT
                    id,
                    user_id,
                    page_access_token,
                    instagram_business_account_id,
                    instagram_username,
                    page_name,
                    status
                FROM social_accounts
                WHERE id = :account_id
                  AND user_id = :user_id
                  AND status = 'connected'
                  AND instagram_business_account_id IS NOT NULL
                LIMIT 1;
            """), {
                "account_id": int(social_account_id),
                "user_id": str(user_id),
            }).mappings().first()
        else:
            row = db.execute(text("""
                SELECT
                    id,
                    user_id,
                    page_access_token,
                    instagram_business_account_id,
                    instagram_username,
                    page_name,
                    status
                FROM social_accounts
                WHERE user_id = :user_id
                  AND status = 'connected'
                  AND instagram_business_account_id IS NOT NULL
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1;
            """), {
                "user_id": str(user_id),
            }).mappings().first()

    return row


# ------------------ CORE ------------------

@dashboard_bp.route('/health/status', methods=['GET', 'POST'])
def health_status():
    return jsonify({
        "status": "ok",
        "message": "Dashboard backend funcionando",
        "checks": {
            "backend": True,
            "database": True,
            "instagram": False,
            "facebook": False,
            "tiktok": False,
            "linkedin": False,
            "youtube": False
        }
    })


@dashboard_bp.route('/status', methods=['GET', 'POST'])
def status_alias():
    return health_status()


# ------------------ SETTINGS ------------------

@dashboard_bp.route('/settings', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def settings():
    if request.method == 'GET':
        current = session.get("settings", {})
        if not isinstance(current, dict):
            current = {}

        current.setdefault("aiEnabled", False)
        current.setdefault("frequency", None)

        return jsonify(current)

    if request.method == 'DELETE':
        session["settings"] = {}
        session.permanent = True
        return jsonify({"success": True})

    data = request.get_json(silent=True) or {}
    current = session.get("settings", {})

    if not isinstance(current, dict):
        current = {}

    current.update(data)

    session["settings"] = current
    session.permanent = True

    return jsonify(current)


# ------------------ SOCIAL ------------------

@dashboard_bp.route('/social-accounts', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def social_accounts():
    user_id = _get_dashboard_user_id()

    all_accounts = session.get("social_accounts", {})
    if not isinstance(all_accounts, dict):
        all_accounts = {}

    accounts = _as_list(all_accounts.get(user_id, []))

    if request.method == 'GET':
        return jsonify(accounts)

    if request.method == 'DELETE':
        all_accounts[user_id] = []
        session["social_accounts"] = all_accounts
        session.permanent = True
        return jsonify([])

    data = request.get_json(silent=True) or {}

    account = {
        "id": str(uuid.uuid4()),
        "platform": data.get("platform") or data.get("provider") or data.get("network"),
        "connected": data.get("connected", True),
        **data
    }

    accounts.append(account)
    all_accounts[user_id] = accounts

    session["social_accounts"] = all_accounts
    session.permanent = True

    return jsonify(accounts), 201


# ------------------ POSTS ------------------

@dashboard_bp.route('/posts', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def posts():
    user_id = _get_dashboard_user_id()

    # -------- GET --------
    if request.method == 'GET':
        status = request.args.get("status")
        business_id = request.args.get("businessId")

        # Calendario necesita datos completos para pintar fecha, texto y estado.
        # Si viene allBusinesses=1, NO usamos slim aunque el frontend lo pida.
        all_businesses = request.args.get("allBusinesses") == "1"
        slim = request.args.get("slim") == "1" and not status and not all_businesses

        posts = get_posts(
            user_id=user_id,
            status=status,
            business_id=business_id,
            slim=slim
        )

        return jsonify(posts)

    # -------- DELETE --------
    if request.method == 'DELETE':
        return jsonify([])

    # -------- CREATE --------
    data = request.get_json(silent=True) or {}

    saved_post = save_post(
        user_id=user_id,
        post=data,
        business_id=data.get("businessId"),
        status=data.get("status", "pending_approval")
    )

    return jsonify(saved_post), 201

@dashboard_bp.route('/posts/<int:post_id>', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
def update_post(post_id):
    user_id = _get_dashboard_user_id()

    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    if not user_id:
        return jsonify({
            "success": False,
            "error": "Usuario no autenticado"
        }), 401

    # -------- DELETE --------
    if request.method == 'DELETE':
        if not db_available():
            return jsonify({
                "success": False,
                "error": "DB no disponible"
            }), 500

        with db_session() as db:
            result = db.execute(text("""
                DELETE FROM posts
                WHERE id = :post_id
                  AND user_id = :user_id
                RETURNING id;
            """), {
                "post_id": int(post_id),
                "user_id": str(user_id)
            }).mappings().first()

        if not result:
            return jsonify({
                "success": False,
                "error": "Post no encontrado"
            }), 404

        return jsonify({
            "success": True,
            "deleted": True,
            "id": post_id
        })

    # -------- GET (FIX DEFINITIVO) --------
    if request.method == 'GET':
        if not db_available():
            return jsonify({
                "success": False,
                "error": "DB no disponible"
            }), 500

        with db_session() as db:
            row = db.execute(text("""
                SELECT id, post, status, business_id, post_number, created_at, updated_at
                FROM posts
                WHERE id = :post_id
                  AND user_id = :user_id
                LIMIT 1;
            """), {
                "post_id": int(post_id),
                "user_id": str(user_id)
            }).mappings().first()

        if not row:
            return jsonify({
                "success": False,
                "error": "Post no encontrado",
                "postId": post_id,
                "userId": user_id
            }), 404

        post_data = row.get("post") or {}

        if isinstance(post_data, str):
            try:
                post_data = json.loads(post_data)
            except Exception:
                post_data = {}

        if not isinstance(post_data, dict):
            post_data = {}

        image_url = (
            post_data.get("imageUrl")
            or post_data.get("image_url")
            or ""
        )

        image_variants = post_data.get("imageVariants") or post_data.get("image_variants") or []

        if not isinstance(image_variants, list):
            image_variants = []

        if not image_variants and image_url:
            image_variants = [{
                "id": row.get("id"),
                "postId": row.get("id"),
                "imageUrl": image_url,
                "imageData": "",
                "rawBackground": image_url,
                "rawBackgroundUrl": image_url,
                "generationStatus": "completed",
                "style": "default",
                "variantIndex": 0,
                "overlayParams": post_data.get("overlayParams") or {},
            }]

        post_data["imageVariants"] = image_variants

        return jsonify({
            "success": True,
            "id": row.get("id"),
            "status": row.get("status"),
            "businessId": row.get("business_id"),
            "postNumber": row.get("post_number") or row.get("id"),
            "createdAt": row.get("created_at").isoformat() if row.get("created_at") else None,
            "updatedAt": row.get("updated_at").isoformat() if row.get("updated_at") else None,
            **post_data
        })

    # -------- UPDATE --------
    data = request.get_json(silent=True) or {}

    allowed_fields = {
        "scheduledAt",
        "scheduled_at",
        "scheduledAtInstagram",
        "scheduledAtTiktok",
        "scheduledAtFacebook",
        "status",
        "platform",
        "caption",
        "hashtags",
        "contentType",
        "instagramPostId",
        "tiktokPostId",
        "facebookPostId",
        "imageUrl",
        "image_url",
    }

    updates = {k: v for k, v in data.items() if k in allowed_fields}

    if not updates:
        return jsonify({
            "success": False,
            "error": "No hay campos válidos para actualizar"
        }), 400

    updated = update_post_fields(
        user_id=user_id,
        post_id=post_id,
        updates=updates
    )

    if not updated:
        return jsonify({
            "success": False,
            "error": "Post no encontrado"
        }), 404

    return jsonify({
        "success": True,
        "post": updated
    })

@dashboard_bp.route('/posts/<int:post_id>/generate-image-variant', methods=['POST'])
def generate_image_variant(post_id):
    user_id = _get_dashboard_user_id()

    if not user_id:
        return jsonify({
            "success": False,
            "error": "Usuario no autenticado"
        }), 401

    data = request.get_json(silent=True) or {}

    if not db_available():
        return jsonify({
            "success": False,
            "error": "DB no disponible"
        }), 500

    with db_session() as db:
        row = db.execute(text("""
            SELECT id, post
            FROM posts
            WHERE id = :post_id
              AND user_id = :user_id
            LIMIT 1;
        """), {
            "post_id": int(post_id),
            "user_id": str(user_id)
        }).mappings().first()

        if not row:
            return jsonify({
                "success": False,
                "error": "Post no encontrado"
            }), 404

        post_data = row.get("post") or {}

        reuse_variant_id = (
            data.get("reuseVariantId")
            or data.get("variantId")
            or post_id
        )

        overlay_params = {
            "customHeadline": data.get("customHeadline"),
            "customLogoUrl": data.get("customLogoUrl"),
            "logoColor": data.get("logoColor"),
            "logoPosition": data.get("logoPosition"),
            "overlayFont": data.get("overlayFont"),
            "showSignature": data.get("showSignature"),
            "signatureText": data.get("signatureText"),
            "style": data.get("style"),
            "textPosition": data.get("textPosition"),
            "textSize": data.get("textSize"),
            "textStyle": data.get("textStyle"),
            "titleColor1": data.get("titleColor1"),
            "titleColor2": data.get("titleColor2"),
        }

        try:
            new_variant, updated_post = create_overlay_variant(
                post_data=post_data,
                post_id=post_id,
                source_variant_id=reuse_variant_id,
                overlay_params=overlay_params,
            )
        except Exception as e:
            return jsonify({
                "success": False,
                "error": str(e)
            }), 400

        db.execute(text("""
            UPDATE posts
            SET
                post = :post,
                updated_at = NOW()
            WHERE id = :post_id
              AND user_id = :user_id;
        """), {
            "post": json.dumps(updated_post),
            "post_id": int(post_id),
            "user_id": str(user_id)
        })

    return jsonify({
        "success": True,
        "message": "Nueva variante creada",
        "variant": new_variant,
        "imageVariants": updated_post.get("imageVariants") or [],
        "selectedImageVariant": updated_post.get("selectedImageVariant"),
    }), 201
    
# ------------------ APPROVE POST ------------------

@dashboard_bp.route('/posts/<int:post_id>/approve', methods=['POST'])
def approve_post(post_id):
    user_id = _get_dashboard_user_id()
    data = request.get_json(silent=True) or {}

    scheduled_at = data.get("scheduledAt")

    extra_updates = {}

    if scheduled_at:
        extra_updates["scheduledAt"] = scheduled_at
        extra_updates["scheduled_at"] = scheduled_at

    if data.get("scheduledAtInstagram"):
        extra_updates["scheduledAtInstagram"] = data.get("scheduledAtInstagram")

    if data.get("scheduledAtTiktok"):
        extra_updates["scheduledAtTiktok"] = data.get("scheduledAtTiktok")

    updated = update_post_status(
        user_id=user_id,
        post_id=post_id,
        status="scheduled",
        extra_updates=extra_updates
    )

    if not updated:
        return jsonify({"success": False, "error": "Post no encontrado"}), 404

    return jsonify({
        "success": True,
        "status": "scheduled",
        "post": updated
    })

@dashboard_bp.route('/posts/<int:post_id>/publish', methods=['POST'])
def publish_post_now(post_id):
    user_id = _get_dashboard_user_id()

    if not user_id:
        return jsonify({"success": False, "error": "Usuario no autenticado"}), 401

    if not db_available():
        return jsonify({"success": False, "error": "DB no disponible"}), 500

    with db_session() as db:
        row = db.execute(text("""
            SELECT id, post, status
            FROM posts
            WHERE id = :post_id
              AND user_id = :user_id
            LIMIT 1;
        """), {
            "post_id": int(post_id),
            "user_id": str(user_id)
        }).mappings().first()

    if not row:
        return jsonify({"success": False, "error": "Post no encontrado"}), 404

    post_data = row.get("post") or {}

    if isinstance(post_data, str):
        post_data = json.loads(post_data)

    if post_data.get("instagramPostId"):
        return jsonify({
            "success": False,
            "error": "Este post ya fue publicado en Instagram"
        }), 400
        
    caption = post_data.get("caption") or ""
    image_url = post_data.get("imageUrl") or post_data.get("image_url")

    if not image_url:
        return jsonify({"success": False, "error": "Post sin imagen pública"}), 400

    result = _publish_to_instagram(
        user_id=user_id,
        caption=caption,
        image_url=image_url
    )

    if not result.get("success"):
        return jsonify(result), 400

    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()

    has_tiktok_pending = bool(
        post_data.get("scheduledAtTiktok")
        and not post_data.get("tiktokPostId")
    )

    next_status = "scheduled" if has_tiktok_pending else "published"

    updated = update_post_status(
        user_id=user_id,
        post_id=post_id,
        status=next_status,
        extra_updates={
            "instagramPostId": result.get("instagramPostId"),
            "publishedAt": now_iso,
            "publishedAtInstagram": now_iso,
        }
    )

    return jsonify({
        "success": True,
        "status": next_status,
        "platform": "instagram",
        "post": updated,
        "instagramPostId": result.get("instagramPostId")
    })

# ---------------- NUEVO ENDPOINT MULTI ----------------

@dashboard_bp.route('/posts/<int:post_id>/publish-now', methods=['POST'])
def publish_post_all_platforms(post_id):
    user_id = _get_dashboard_user_id()

    if not user_id:
        return jsonify({"success": False, "error": "Usuario no autenticado"}), 401

    if not db_available():
        return jsonify({"success": False, "error": "DB no disponible"}), 500

    with db_session() as db:
        row = db.execute(text("""
            SELECT id, post, status
            FROM posts
            WHERE id = :post_id
              AND user_id = :user_id
            LIMIT 1;
        """), {
            "post_id": int(post_id),
            "user_id": str(user_id)
        }).mappings().first()

    if not row:
        return jsonify({"success": False, "error": "Post no encontrado"}), 404

    post_data = row.get("post") or {}

    if isinstance(post_data, str):
        post_data = json.loads(post_data)

    caption = post_data.get("caption") or ""
    image_url = post_data.get("imageUrl") or post_data.get("image_url")

    if not image_url:
        return jsonify({"success": False, "error": "Post sin imagen pública"}), 400

    results = {}

    # INSTAGRAM
    if not post_data.get("instagramPostId"):
        ig_result = _publish_to_instagram(
            user_id=user_id,
            caption=caption,
            image_url=image_url
        )
        results["instagram"] = ig_result
    else:
        results["instagram"] = {
            "success": False,
            "error": "Ya publicado en Instagram"
        }

    # TIKTOK (placeholder)
    if not post_data.get("tiktokPostId"):
        results["tiktok"] = {
            "success": False,
            "error": "TikTok aún no implementado"
        }
    else:
        results["tiktok"] = {
            "success": False,
            "error": "Ya publicado en TikTok"
        }

    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()

    has_tiktok_pending = not post_data.get("tiktokPostId")
    next_status = "scheduled" if has_tiktok_pending else "published"

    extra_updates = {
        "publishedAt": now_iso
    }

    if results.get("instagram", {}).get("success"):
        extra_updates["instagramPostId"] = results["instagram"].get("instagramPostId")
        extra_updates["publishedAtInstagram"] = now_iso

    updated = update_post_status(
        user_id=user_id,
        post_id=post_id,
        status=next_status,
        extra_updates=extra_updates
    )

    return jsonify({
        "success": True,
        "status": next_status,
        "results": results,
        "post": updated
    })

# ------------------ SCHEDULE ------------------

@dashboard_bp.route('/schedule', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def schedule():
    schedule_list = _as_list(session.get("schedule", []))

    if request.method == 'GET':
        return jsonify(schedule_list)

    if request.method == 'DELETE':
        session["schedule"] = []
        session.permanent = True
        return jsonify([])

    data = request.get_json(silent=True) or {}

    item = {
        "id": str(uuid.uuid4()),
        **data
    }

    schedule_list.append(item)
    session["schedule"] = schedule_list
    session.permanent = True

    return jsonify(schedule_list), 201

# ------------------ APPROVAL UI COMPATIBILITY — FIX 404/405 SEGURO ------------------

def _load_user_post_for_dashboard(user_id, post_id):
    if not user_id:
        return None, None

    if not db_available():
        return None, None

    with db_session() as db:
        row = db.execute(text("""
            SELECT id, post, status, business_id, post_number, created_at, updated_at
            FROM posts
            WHERE id = :post_id
              AND user_id = :user_id
            LIMIT 1;
        """), {
            "post_id": int(post_id),
            "user_id": str(user_id),
        }).mappings().first()

    if not row:
        return None, None

    post_data = row.get("post") or {}

    if isinstance(post_data, str):
        try:
            post_data = json.loads(post_data)
        except Exception:
            post_data = {}

    if not isinstance(post_data, dict):
        post_data = {}

    variants = post_data.get("imageVariants") or post_data.get("image_variants") or []
    if not isinstance(variants, list):
        variants = []

    post_data["imageVariants"] = variants

    return row, post_data


def _save_user_post_json(user_id, post_id, post_data):
    if not db_available():
        return False

    with db_session() as db:
        db.execute(text("""
            UPDATE posts
            SET post = :post,
                updated_at = NOW()
            WHERE id = :post_id
              AND user_id = :user_id;
        """), {
            "post": json.dumps(post_data),
            "post_id": int(post_id),
            "user_id": str(user_id),
        })

    return True


def _safe_text(value, max_len=5000):
    if value is None:
        return ""

    text_value = str(value).strip()

    # Seguridad básica anti-XSS / anti payload visual.
    text_value = (
        text_value
        .replace("<script", "")
        .replace("</script", "")
        .replace("javascript:", "")
        .replace("data:text/html", "")
    )

    return text_value[:max_len]


def _simple_spanish_spellcheck(text_value):
    clean = _safe_text(text_value, 3000)

    if not clean:
        return {
            "hasErrors": False,
            "corrected": "",
            "explanation": ""
        }

    replacements = {
        " energia ": " energía ",
        " publicacion ": " publicación ",
        " promocion ": " promoción ",
        " solucion ": " solución ",
        " informacion ": " información ",
        " atencion ": " atención ",
        " mas ": " más ",
        " tu negocio ": " tu negocio ",
    }

    corrected = f" {clean} "
    for wrong, fixed in replacements.items():
        corrected = corrected.replace(wrong, fixed)

    corrected = corrected.strip()

    return {
        "hasErrors": corrected != clean,
        "corrected": corrected,
        "explanation": "Revisión básica activa. La revisión IA avanzada se conectará después."
    }


@dashboard_bp.route('/posts/check-headline', methods=['POST', 'OPTIONS'])
def check_headline_flask():
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    data = request.get_json(silent=True) or {}
    text_value = data.get("text") or ""

    return jsonify(_simple_spanish_spellcheck(text_value))


@dashboard_bp.route('/posts/check-caption', methods=['POST', 'OPTIONS'])
def check_caption_flask():
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    data = request.get_json(silent=True) or {}
    text_value = data.get("text") or ""

    return jsonify(_simple_spanish_spellcheck(text_value))


@dashboard_bp.route('/posts/<int:post_id>/variants/<variant_id>/overlay-params', methods=['PATCH', 'OPTIONS'])
def save_variant_overlay_params_flask(post_id, variant_id):
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    user_id = _get_dashboard_user_id()

    if not user_id:
        return jsonify({"success": False, "error": "Usuario no autenticado"}), 401

    row, post_data = _load_user_post_for_dashboard(user_id, post_id)

    if not row:
        return jsonify({"success": False, "error": "Post no encontrado"}), 404

    data = request.get_json(silent=True) or {}

    allowed = {
        "titleColor1",
        "titleColor2",
        "signatureText",
        "showSignature",
        "customLogoUrl",
        "overlayTitleColor1",
        "overlayTitleColor2",
        "overlaySignatureText",
        "overlayShowSignature",
        "overlayCustomLogoUrl",
    }

    clean_data = {k: data.get(k) for k in allowed if k in data}

    variants = post_data.get("imageVariants") or []
    target_id = str(variant_id)

    found = False

    for variant in variants:
        if str(variant.get("id")) == target_id:
            found = True

            # Mantener compatibilidad con nombres Express y nombres Flask.
            if "titleColor1" in clean_data:
                variant["overlayTitleColor1"] = _safe_text(clean_data.get("titleColor1"), 40)

            if "titleColor2" in clean_data:
                variant["overlayTitleColor2"] = _safe_text(clean_data.get("titleColor2"), 40)

            if "signatureText" in clean_data:
                variant["overlaySignatureText"] = _safe_text(clean_data.get("signatureText"), 120)

            if "showSignature" in clean_data:
                variant["overlayShowSignature"] = bool(clean_data.get("showSignature"))

            if "customLogoUrl" in clean_data:
                logo_url = clean_data.get("customLogoUrl")
                variant["overlayCustomLogoUrl"] = _safe_text(logo_url, 1000) if logo_url else None

            variant.setdefault("overlayParams", {})
            variant["overlayParams"].update({
                "titleColor1": variant.get("overlayTitleColor1"),
                "titleColor2": variant.get("overlayTitleColor2"),
                "signatureText": variant.get("overlaySignatureText"),
                "showSignature": variant.get("overlayShowSignature"),
                "customLogoUrl": variant.get("overlayCustomLogoUrl"),
            })

            break

    if not found:
        return jsonify({"success": False, "error": "Variante no encontrada"}), 404

    _save_user_post_json(user_id, post_id, post_data)

    return jsonify({
        "success": True,
        "ok": True,
        "imageVariants": variants,
    })


@dashboard_bp.route('/posts/<int:post_id>/variants/<variant_id>', methods=['DELETE', 'OPTIONS'])
def delete_variant_flask(post_id, variant_id):
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    user_id = _get_dashboard_user_id()

    if not user_id:
        return jsonify({"success": False, "error": "Usuario no autenticado"}), 401

    row, post_data = _load_user_post_for_dashboard(user_id, post_id)

    if not row:
        return jsonify({"success": False, "error": "Post no encontrado"}), 404

    variants = post_data.get("imageVariants") or []
    before = len(variants)

    variants = [
        variant for variant in variants
        if str(variant.get("id")) != str(variant_id)
    ]

    if len(variants) == before:
        return jsonify({"success": False, "error": "Variante no encontrada"}), 404

    for idx, variant in enumerate(variants):
        variant["variantIndex"] = idx

    post_data["imageVariants"] = variants

    if str(post_data.get("selectedImageVariant")) == str(variant_id):
        post_data["selectedImageVariant"] = variants[0].get("id") if variants else None

    _save_user_post_json(user_id, post_id, post_data)

    return jsonify({
        "success": True,
        "ok": True,
        "imageVariants": variants,
        "selectedImageVariant": post_data.get("selectedImageVariant"),
    })


@dashboard_bp.route('/posts/<int:post_id>/reorder-slides', methods=['POST', 'OPTIONS'])
def reorder_slides_flask(post_id):
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    user_id = _get_dashboard_user_id()

    if not user_id:
        return jsonify({"success": False, "error": "Usuario no autenticado"}), 401

    row, post_data = _load_user_post_for_dashboard(user_id, post_id)

    if not row:
        return jsonify({"success": False, "error": "Post no encontrado"}), 404

    data = request.get_json(silent=True) or {}
    variant_ids = data.get("variantIds") or []

    if not isinstance(variant_ids, list) or not variant_ids:
        return jsonify({
            "success": False,
            "error": "variantIds debe ser una lista no vacía"
        }), 400

    safe_order = [str(v) for v in variant_ids]
    variants = post_data.get("imageVariants") or []

    by_id = {str(v.get("id")): v for v in variants}
    ordered = []

    for variant_id in safe_order:
        if variant_id in by_id:
            ordered.append(by_id[variant_id])

    # Mantener variantes no incluidas al final para no perder datos.
    for variant in variants:
        if str(variant.get("id")) not in safe_order:
            ordered.append(variant)

    for idx, variant in enumerate(ordered):
        variant["variantIndex"] = idx

    post_data["imageVariants"] = ordered

    _save_user_post_json(user_id, post_id, post_data)

    return jsonify({
        "success": True,
        "id": post_id,
        **post_data
    })


@dashboard_bp.route('/posts/<int:post_id>/retry-image', methods=['POST', 'OPTIONS'])
def retry_image_flask(post_id):
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    user_id = _get_dashboard_user_id()

    if not user_id:
        return jsonify({"success": False, "error": "Usuario no autenticado"}), 401

    row, post_data = _load_user_post_for_dashboard(user_id, post_id)

    if not row:
        return jsonify({"success": False, "error": "Post no encontrado"}), 404

    variants = post_data.get("imageVariants") or []

    for variant in variants:
        if variant.get("generationStatus") in ["error", "failed", "pending"]:
            variant["generationStatus"] = "pending"
            variant["generationError"] = None

    post_data["imageVariants"] = variants
    post_data["imageRetryRequested"] = True

    _save_user_post_json(user_id, post_id, post_data)

    return jsonify({
        "success": True,
        "retrying": True,
        "message": "Reintento registrado. Si la imagen no aparece, genera una nueva variante.",
        "post": post_data,
    })


@dashboard_bp.route('/posts/<int:post_id>/regenerate-hashtags', methods=['POST', 'OPTIONS'])
def regenerate_hashtags_flask(post_id):
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    user_id = _get_dashboard_user_id()

    if not user_id:
        return jsonify({"success": False, "error": "Usuario no autenticado"}), 401

    row, post_data = _load_user_post_for_dashboard(user_id, post_id)

    if not row:
        return jsonify({"success": False, "error": "Post no encontrado"}), 404

    company = _safe_text(post_data.get("companyName") or post_data.get("businessName") or "HazPost", 40)
    industry = _safe_text(post_data.get("industry") or post_data.get("businessType") or "NegocioLocal", 40)
    location = _safe_text(post_data.get("locationName") or post_data.get("location") or "", 40)

    def tagify(value):
        clean = "".join(ch for ch in str(value) if ch.isalnum())
        return clean[:40]

    tags = [
        f"#{tagify(company)}",
        f"#{tagify(industry)}",
        "#NegocioLocal",
        "#MarketingDigital",
        "#HazPost",
    ]

    if location:
        tags.insert(2, f"#{tagify(location)}")

    hashtags = " ".join([tag for tag in tags if len(tag) > 1])
    hashtags_tiktok = f"{hashtags} #ParaTi #TikTokColombia"

    post_data["hashtags"] = hashtags
    post_data["hashtagsTiktok"] = hashtags_tiktok

    _save_user_post_json(user_id, post_id, post_data)

    return jsonify({
        "success": True,
        "hashtags": hashtags,
        "hashtagsTiktok": hashtags_tiktok,
    })


@dashboard_bp.route('/posts/<int:post_id>/mark-manual', methods=['POST', 'OPTIONS'])
def mark_manual_flask(post_id):
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    user_id = _get_dashboard_user_id()

    if not user_id:
        return jsonify({"success": False, "error": "Usuario no autenticado"}), 401

    updated = update_post_status(
        user_id=user_id,
        post_id=post_id,
        status="published",
        extra_updates={
            "publishedManually": True,
            "manualPublishedAt": None,
        }
    )

    if not updated:
        return jsonify({"success": False, "error": "Post no encontrado"}), 404

    return jsonify({
        "success": True,
        "ok": True,
        "post": updated,
    })

# ------------------ INSTAGRAM PUBLISH ------------------

@dashboard_bp.route('/social-accounts/default', methods=['POST', 'OPTIONS'])
def set_default_social_account():
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    user_id = _get_dashboard_user_id()
    data = request.get_json(silent=True) or {}

    platform = data.get("platform") or "instagram"
    social_account_id = (
        data.get("socialAccountId")
        or data.get("social_account_id")
        or data.get("instagramAccountId")
        or data.get("instagram_account_id")
    )

    if not social_account_id:
        return jsonify({
            "success": False,
            "error": "Falta socialAccountId"
        }), 400

    account = _get_instagram_social_account(user_id, social_account_id)

    if not account:
        return jsonify({
            "success": False,
            "error": "Cuenta social no encontrada o no pertenece al usuario"
        }), 404

    saved = _set_default_social_account(user_id, platform, social_account_id)

    return jsonify({
        "success": True,
        "platform": platform,
        "socialAccountId": saved.get("social_account_id"),
        "instagramUsername": account.get("instagram_username"),
        "pageName": account.get("page_name"),
    })

def _publish_to_instagram(user_id, caption, image_url, social_account_id=None):
    account = _get_instagram_social_account(user_id, social_account_id)

    if not account:
        return {"success": False, "error": "No hay cuenta de Instagram conectada"}

    access_token = account.get("page_access_token")
    ig_user_id = account.get("instagram_business_account_id")

    if not access_token or not ig_user_id:
        return {"success": False, "error": "Cuenta inválida"}

    try:
        create_res = requests.post(
            f"{META_GRAPH_BASE}/{ig_user_id}/media",
            data={
                "image_url": image_url,
                "caption": caption,
                "access_token": access_token,
            },
            timeout=30,
        )

        create_data = create_res.json()

        if not create_res.ok:
            return {
                "success": False,
                "stage": "create_media_container",
                "error": create_data,
            }

        creation_id = create_data.get("id")

        publish_res = requests.post(
            f"{META_GRAPH_BASE}/{ig_user_id}/media_publish",
            data={
                "creation_id": creation_id,
                "access_token": access_token,
            },
            timeout=30,
        )

        publish_data = publish_res.json()

        if not publish_res.ok:
            return {
                "success": False,
                "stage": "publish_media",
                "error": publish_data,
            }

        # 🔥 AGREGA ESTA LÍNEA
        _set_default_social_account(user_id, "instagram", account.get("id"))

        return {
            "success": True,
            "instagramPostId": publish_data.get("id"),
        }

    except Exception as e:
        return {"success": False, "error": str(e)}
        
@dashboard_bp.route('/publish/instagram', methods=['POST', 'OPTIONS'])
def publish_instagram_now():
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    user_id = _get_dashboard_user_id()
    data = request.get_json(silent=True) or {}

    caption = data.get("caption") or data.get("text") or ""
    image_url = data.get("imageUrl") or data.get("image_url")
    social_account_id = (
        data.get("socialAccountId")
        or data.get("social_account_id")
        or data.get("instagramAccountId")
        or data.get("instagram_account_id")
    )

    if not image_url:
        return jsonify({
            "success": False,
            "error": "Falta image_url o imageUrl público para publicar en Instagram"
        }), 400

    account = _get_instagram_social_account(user_id, social_account_id)

    if not account:
        return jsonify({
            "success": False,
            "error": "No hay cuenta de Instagram conectada/default para publicar"
        }), 404

    access_token = account.get("page_access_token")
    ig_user_id = account.get("instagram_business_account_id")

    if not access_token or not ig_user_id:
        return jsonify({
            "success": False,
            "error": "La cuenta seleccionada no tiene token o Instagram Business ID"
        }), 400

    try:
        create_res = requests.post(
            f"{META_GRAPH_BASE}/{ig_user_id}/media",
            data={
                "image_url": image_url,
                "caption": caption,
                "access_token": access_token,
            },
            timeout=30,
        )

        create_data = create_res.json()

        if not create_res.ok:
            return jsonify({
                "success": False,
                "stage": "create_media_container",
                "error": create_data,
            }), create_res.status_code

        creation_id = create_data.get("id")

        if not creation_id:
            return jsonify({
                "success": False,
                "error": "Meta no devolvió creation_id",
                "metaResponse": create_data,
            }), 500

        publish_res = requests.post(
            f"{META_GRAPH_BASE}/{ig_user_id}/media_publish",
            data={
                "creation_id": creation_id,
                "access_token": access_token,
            },
            timeout=30,
        )

        publish_data = publish_res.json()

        if not publish_res.ok:
            return jsonify({
                "success": False,
                "stage": "publish_media",
                "error": publish_data,
            }), publish_res.status_code

        _set_default_social_account(user_id, "instagram", account.get("id"))

        return jsonify({
            "success": True,
            "platform": "instagram",
            "socialAccountId": account.get("id"),
            "instagramUsername": account.get("instagram_username"),
            "pageName": account.get("page_name"),
            "creationId": creation_id,
            "instagramPostId": publish_data.get("id"),
            "metaResponse": publish_data,
        })

    except Exception as exc:
        return jsonify({
            "success": False,
            "error": str(exc),
        }), 500

# ------------------ SUPPORT ------------------

@dashboard_bp.route('/unread', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def unread():
    unread_list = _as_list(session.get("unread", []))

    if request.method == 'GET':
        return jsonify(unread_list)

    if request.method == 'DELETE':
        session["unread"] = []
        session.permanent = True
        return jsonify([])

    data = request.get_json(silent=True) or {}

    item = {
        "id": str(uuid.uuid4()),
        "read": False,
        **data
    }

    unread_list.append(item)
    session["unread"] = unread_list
    session.permanent = True

    return jsonify(unread_list), 201


@dashboard_bp.route('/support/unread', methods=['GET'])
def support_unread():
    unread_list = _as_list(session.get("unread", []))
    return jsonify(unread_list)


# ------------------ NUEVOS ENDPOINTS (FIX 405 + COMPAT FRONTEND) ------------------

@dashboard_bp.route('/caption-addons', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
def caption_addons():
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    addons = _as_list(session.get("caption_addons", []))

    # -------- GET --------
    if request.method == 'GET':
        return jsonify(addons)

    # -------- DELETE --------
    if request.method == 'DELETE':
        data = request.get_json(silent=True) or {}
        addon_id = data.get("id")

        if addon_id:
            addons = [
                addon for addon in addons
                if str(addon.get("id")) != str(addon_id)
            ]
        else:
            addons = []

        session["caption_addons"] = addons
        session.permanent = True

        return jsonify({
            "success": True,
            "items": addons
        })

    # -------- CREATE / UPDATE --------
    data = request.get_json(silent=True) or {}

    addon = {
        "id": data.get("id") or str(uuid.uuid4()),
        "name": _safe_text(data.get("name") or "Addon", 120),
        "text": _safe_text(data.get("text") or data.get("value") or "", 1000),
        "enabled": bool(data.get("enabled", True)),
    }

    existing_index = next(
        (
            index for index, item in enumerate(addons)
            if str(item.get("id")) == str(addon["id"])
        ),
        None
    )

    if existing_index is not None:
        addons[existing_index] = {
            **addons[existing_index],
            **addon
        }
    else:
        addons.append(addon)

    session["caption_addons"] = addons
    session.permanent = True

    return jsonify({
        "success": True,
        "items": addons
    })


@dashboard_bp.route('/media', methods=['GET', 'POST', 'DELETE', 'OPTIONS'])
def media():
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    media_items = _as_list(session.get("media_items", []))

    # -------- GET --------
    if request.method == 'GET':
        return jsonify(media_items)

    # -------- DELETE --------
    if request.method == 'DELETE':
        data = request.get_json(silent=True) or {}
        media_id = data.get("id")

        media_items = [
            item for item in media_items
            if str(item.get("id")) != str(media_id)
        ]

        session["media_items"] = media_items
        session.permanent = True

        return jsonify({
            "success": True,
            "items": media_items
        })

    # -------- CREATE --------
    data = request.get_json(silent=True) or {}

    media_item = {
        "id": str(uuid.uuid4()),
        "url": _safe_text(data.get("url") or data.get("imageUrl") or "", 2000),
        "type": _safe_text(data.get("type") or "image", 40),
        "name": _safe_text(data.get("name") or "Media", 120),
    }

    media_items.append(media_item)

    session["media_items"] = media_items
    session.permanent = True

    return jsonify({
        "success": True,
        "item": media_item,
        "items": media_items
    }), 201


@dashboard_bp.route('/music', methods=['GET', 'POST', 'OPTIONS'])
@dashboard_bp.route('/music/upload', methods=['POST', 'OPTIONS'])
@dashboard_bp.route('/music/sync', methods=['POST', 'OPTIONS'])
def music():
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    music_items = _as_list(session.get("music_items", []))

    # -------- GET --------
    if request.method == 'GET':
        return jsonify(music_items)

    # -------- CREATE / MOCK UPLOAD --------
    data = request.get_json(silent=True) or {}

    item = {
        "id": str(uuid.uuid4()),
        "name": _safe_text(data.get("name") or "Audio", 120),
        "url": _safe_text(data.get("url") or "", 2000),
        "provider": _safe_text(data.get("provider") or "manual", 80),
        "status": "ready",
    }

    music_items.append(item)

    session["music_items"] = music_items
    session.permanent = True

    return jsonify({
        "success": True,
        "item": item,
        "items": music_items
    })


@dashboard_bp.route('/fonts', methods=['GET', 'POST', 'OPTIONS'])
def fonts():
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    fonts_list = [
        {
            "id": "montserrat",
            "name": "Montserrat",
            "category": "sans-serif"
        },
        {
            "id": "poppins",
            "name": "Poppins",
            "category": "sans-serif"
        },
        {
            "id": "bebas-neue",
            "name": "Bebas Neue",
            "category": "display"
        },
        {
            "id": "playfair",
            "name": "Playfair Display",
            "category": "serif"
        }
    ]

    return jsonify(fonts_list)

@dashboard_bp.route('/me', methods=['GET'])
def me_alias():
    user = session.get("user")
    return jsonify(user or {})

# ------------------ COMPAT ROUTES WITH IDS ------------------

@dashboard_bp.route('/caption-addons/<addon_id>', methods=['PUT', 'PATCH', 'DELETE', 'OPTIONS'])
def caption_addon_by_id(addon_id):
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    addons = _as_list(session.get("caption_addons", []))

    # -------- DELETE --------
    if request.method == 'DELETE':
        addons = [
            addon for addon in addons
            if str(addon.get("id")) != str(addon_id)
        ]

        session["caption_addons"] = addons
        session.permanent = True

        return jsonify({
            "success": True,
            "items": addons
        })

    # -------- UPDATE --------
    data = request.get_json(silent=True) or {}

    updated = None

    for addon in addons:
        if str(addon.get("id")) == str(addon_id):
            addon["name"] = _safe_text(
                data.get("name", addon.get("name")),
                120
            )

            addon["text"] = _safe_text(
                data.get("text", addon.get("text")),
                1000
            )

            addon["enabled"] = bool(
                data.get("enabled", addon.get("enabled", True))
            )

            updated = addon
            break

    session["caption_addons"] = addons
    session.permanent = True

    if not updated:
        return jsonify({
            "success": False,
            "error": "Addon no encontrado"
        }), 404

    return jsonify({
        "success": True,
        "item": updated,
        "items": addons
    })


@dashboard_bp.route('/media/<media_id>', methods=['DELETE', 'OPTIONS'])
def media_by_id(media_id):
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    media_items = _as_list(session.get("media_items", []))

    media_items = [
        item for item in media_items
        if str(item.get("id")) != str(media_id)
    ]

    session["media_items"] = media_items
    session.permanent = True

    return jsonify({
        "success": True,
        "items": media_items
    })


@dashboard_bp.route('/fonts/upload', methods=['POST', 'OPTIONS'])
def upload_font():
    if request.method == 'OPTIONS':
        return jsonify({"success": True})

    data = request.get_json(silent=True) or {}

    font = {
        "id": str(uuid.uuid4()),
        "name": _safe_text(data.get("name") or "Custom Font", 120),
        "family": _safe_text(data.get("family") or "sans-serif", 120),
        "category": _safe_text(data.get("category") or "custom", 120),
    }

    return jsonify({
        "ok": True,
        "font": font
    }), 201

# ------------------ ALERTS ------------------

@dashboard_bp.route('/alerts', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def alerts():
    alerts_list = _as_list(session.get("alerts", []))

    if request.method == 'GET':
        return jsonify(alerts_list)

    if request.method == 'DELETE':
        session["alerts"] = []
        session.permanent = True
        return jsonify([])

    data = request.get_json(silent=True) or {}

    alert = {
        "id": str(uuid.uuid4()),
        "status": data.get("status", "active"),
        **data
    }

    alerts_list.append(alert)
    session["alerts"] = alerts_list
    session.permanent = True

    return jsonify(alerts_list), 201


# ------------------ GENERADOR MASIVO (FIX 405) ------------------

@dashboard_bp.route('/niches', methods=['GET'])
def niches():
    scope = request.args.get("scope")

    if scope == "all":
        return jsonify({
            "niches": [],
            "pending": [],
            "approved": [],
            "rejected": [],
            "extra_niche": []
        })

    return jsonify([])


@dashboard_bp.route('/packages', methods=['GET'])
def packages():
    return jsonify([])


@dashboard_bp.route('/elements', methods=['GET'])
def elements():
    business_id = request.args.get("businessId")

    return jsonify({
        "elements": [],
        "items": [],
        "data": []
    })


@dashboard_bp.route('/music/status', methods=['GET'])
def music_status():
    return jsonify({
        "enabled": False,
        "connected": False,
        "provider": None,
        "status": "inactive"
    })


@dashboard_bp.route('/billing/packages', methods=['GET'])
def billing_packages():
    return jsonify({
        "packages": []
    })


@dashboard_bp.route('/subscriptions/me', methods=['GET'])
def subscriptions_me():
    subscription = session.get("subscription") or {
        "plan": "free",
        "status": "active",
        "creditsRemaining": 40,
        "creditsTotal": 40,
        "periodEnd": None,
    }

    return jsonify(subscription)


