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
        or "demo"
    )

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

@dashboard_bp.route('/posts/<int:post_id>', methods=['POST', 'PUT', 'PATCH'])
def update_post(post_id):
    user_id = _get_dashboard_user_id()
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
    }

    updates = {
        key: value
        for key, value in data.items()
        if key in allowed_fields
    }

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


