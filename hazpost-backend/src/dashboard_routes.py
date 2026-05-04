import uuid
import os
import requests

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

@dashboard_bp.route('/posts/<int:post_id>', methods=['GET', 'POST', 'PUT', 'PATCH'])
def update_post(post_id):
    user_id = _get_dashboard_user_id()

    if not user_id:
        return jsonify({
            "success": False,
            "error": "Usuario no autenticado"
        }), 401

    # -------- GET (FIX DEFINITIVO) --------
    if request.method == 'GET':
        if not db_available():
            return jsonify({
                "success": False,
                "error": "DB no disponible"
            }), 500

        with db_session() as db:
            row = db.execute(text("""
                SELECT id, post, status, business_id, created_at, updated_at
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

        return jsonify({
            "id": row.get("id"),
            "status": row.get("status"),
            "businessId": row.get("business_id"),
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

    updated = update_post_status(
        user_id=user_id,
        post_id=post_id,
        status="published",
        extra_updates={
            "instagramPostId": result.get("instagramPostId"),
            "publishedAt": now_iso,
            "scheduledAt": now_iso,
        }
    )

    return jsonify({
        "success": True,
        "status": "published",
        "post": updated,
        "instagramPostId": result.get("instagramPostId")
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


# ------------------ NUEVOS ENDPOINTS (FIX 405) ------------------

@dashboard_bp.route('/caption-addons', methods=['GET'])
def caption_addons():
    return jsonify([])


@dashboard_bp.route('/media', methods=['GET'])
def media():
    return jsonify([])


@dashboard_bp.route('/music', methods=['GET'])
def music():
    return jsonify([])


@dashboard_bp.route('/fonts', methods=['GET'])
def fonts():
    return jsonify([])


@dashboard_bp.route('/me', methods=['GET'])
def me_alias():
    user = session.get("user")
    return jsonify(user or {})


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


