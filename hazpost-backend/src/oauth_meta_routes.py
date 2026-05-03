import os
import json
import time
import secrets
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
import base64

import requests
from flask import Blueprint, jsonify, redirect, request, session
from sqlalchemy import text

from src.db import db_available, db_session

logger = logging.getLogger(__name__)

oauth_meta_bp = Blueprint("oauth_meta_bp", __name__)

META_GRAPH_VERSION = os.getenv("META_GRAPH_VERSION", "v25.0")
META_GRAPH_BASE = f"https://graph.facebook.com/{META_GRAPH_VERSION}"
META_DIALOG_URL = f"https://www.facebook.com/{META_GRAPH_VERSION}/dialog/oauth"

META_APP_ID = os.getenv("META_APP_ID") or os.getenv("FACEBOOK_APP_ID")
META_APP_SECRET = os.getenv("META_APP_SECRET") or os.getenv("FACEBOOK_APP_SECRET")
META_CONFIG_ID = os.getenv("META_CONFIG_ID")
META_REDIRECT_URI = os.getenv(
    "META_REDIRECT_URI",
    "https://hazpost-backend-v2-production.up.railway.app/api/oauth/facebook/callback",
)

FRONTEND_URL = (
    os.getenv("FRONTEND_URL")
    or os.getenv("CORS_ORIGIN", "").split(",")[0].strip()
    or "https://app.hazpost.app"
).rstrip("/")

META_SCOPES = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_manage_metadata",
    "instagram_basic",
    "instagram_content_publish",
]


def _now_utc():
    return datetime.now(timezone.utc)


def _iso(dt):
    if not dt:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _get_user_key():
    """
    Mantiene compatibilidad con el sistema actual:
    - sesión Flask si existe
    - headers usados por frontend
    - fallback controlado
    """
    user = session.get("user") or {}

    user_id = (
        user.get("email")
        or user.get("id")
        or request.headers.get("X-User-ID")
        or request.args.get("user_id")
        or request.args.get("user")
    )

    if user_id:
        return str(user_id).strip().lower()

    return "anonymous"
    

def _encode_oauth_state(user_id):
    payload = {
        "user_id": str(user_id or "").strip().lower(),
        "nonce": secrets.token_urlsafe(24),
        "ts": int(time.time()),
    }

    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _decode_oauth_state(state):
    if not state:
        return None

    try:
        padded_state = str(state) + "=" * (-len(str(state)) % 4)
        raw = base64.urlsafe_b64decode(padded_state.encode("utf-8"))
        payload = json.loads(raw.decode("utf-8"))
        user_id = str(payload.get("user_id") or "").strip().lower()
    except Exception:
        return None

    if not user_id or user_id == "anonymous":
        return None

    return user_id


def _frontend_redirect(path="/settings", **params):
    clean_path = path if str(path).startswith("/") else f"/{path}"
    query = urlencode({k: v for k, v in params.items() if v is not None})
    if query:
        return f"{FRONTEND_URL}{clean_path}?{query}"
    return f"{FRONTEND_URL}{clean_path}"


def _json_error(message, status=400, **extra):
    payload = {
        "ok": False,
        "success": False,
        "error": message,
    }
    payload.update(extra)
    return jsonify(payload), status


def _require_meta_config():
    missing = []

    if not META_APP_ID:
        missing.append("META_APP_ID")

    if not META_APP_SECRET:
        missing.append("META_APP_SECRET")

    if not META_REDIRECT_URI:
        missing.append("META_REDIRECT_URI")

    if missing:
        return False, missing

    return True, []


def _ensure_social_accounts_table():
    if not db_available():
        return False

    with db_session() as db:
        db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS social_accounts (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    provider TEXT NOT NULL DEFAULT 'meta',
                    page_id TEXT,
                    page_name TEXT,
                    page_access_token TEXT,
                    instagram_business_account_id TEXT,
                    instagram_username TEXT,
                    status TEXT NOT NULL DEFAULT 'connected',
                    scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
                    raw JSONB NOT NULL DEFAULT '{}'::jsonb,
                    expires_at TIMESTAMP NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
                """
            )
        )

        db.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_social_accounts_user_id
                ON social_accounts (user_id);
                """
            )
        )

        db.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_social_accounts_provider
                ON social_accounts (provider);
                """
            )
        )

        db.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_social_accounts_user_provider_page
                ON social_accounts (user_id, provider, page_id)
                WHERE page_id IS NOT NULL;
                """
            )
        )

    return True

def _get_default_social_account_id(user_id, platform="instagram"):
    if not db_available():
        return None

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

def _graph_get(path, params=None):
    url = f"{META_GRAPH_BASE}/{str(path).lstrip('/')}"
    response = requests.get(url, params=params or {}, timeout=20)

    try:
        data = response.json()
    except Exception:
        data = {"raw": response.text}

    if not response.ok:
        logger.warning("Meta GET error %s: %s", url, data)
        raise RuntimeError(data.get("error", {}).get("message") or "Meta GET request failed")

    return data


def _exchange_code_for_token(code):
    data = _graph_get(
        "oauth/access_token",
        {
            "client_id": META_APP_ID,
            "client_secret": META_APP_SECRET,
            "redirect_uri": META_REDIRECT_URI,
            "code": code,
        },
    )

    access_token = data.get("access_token")
    expires_in = data.get("expires_in")

    if not access_token:
        raise RuntimeError("Meta no devolvió access_token")

    expires_at = None
    if expires_in:
        expires_at = _now_utc() + timedelta(seconds=int(expires_in))

    return access_token, expires_at, data


def _exchange_for_long_lived_token(short_lived_token):
    try:
        data = _graph_get(
            "oauth/access_token",
            {
                "grant_type": "fb_exchange_token",
                "client_id": META_APP_ID,
                "client_secret": META_APP_SECRET,
                "fb_exchange_token": short_lived_token,
            },
        )

        access_token = data.get("access_token") or short_lived_token
        expires_in = data.get("expires_in")

        expires_at = None
        if expires_in:
            expires_at = _now_utc() + timedelta(seconds=int(expires_in))

        return access_token, expires_at, data

    except Exception as exc:
        logger.warning("No se pudo cambiar a long-lived token: %s", exc)
        return short_lived_token, None, {"warning": str(exc)}


def _get_pages(user_access_token):
    data = _graph_get(
        "me/accounts",
        {
            "access_token": user_access_token,
            "fields": "id,name,access_token,category,tasks,instagram_business_account{id,username}",
            "limit": 100,
        },
    )

    return data.get("data") or []


def _save_social_account(user_id, page, user_token_expires_at=None, scopes=None):
    _ensure_social_accounts_table()

    page_id = str(page.get("id") or "").strip()
    page_name = page.get("name") or "Facebook Page"
    page_access_token = page.get("access_token")

    instagram_business = page.get("instagram_business_account") or {}
    instagram_business_id = instagram_business.get("id")
    instagram_username = instagram_business.get("username")

    raw = {
        "page": page,
        "connectedAt": _now_utc().isoformat(),
    }

    with db_session() as db:
        row = db.execute(
            text(
                """
                INSERT INTO social_accounts (
                    user_id,
                    provider,
                    page_id,
                    page_name,
                    page_access_token,
                    instagram_business_account_id,
                    instagram_username,
                    status,
                    scopes,
                    raw,
                    expires_at,
                    updated_at
                )
                VALUES (
                    :user_id,
                    'meta',
                    :page_id,
                    :page_name,
                    :page_access_token,
                    :instagram_business_account_id,
                    :instagram_username,
                    'connected',
                    CAST(:scopes AS JSONB),
                    CAST(:raw AS JSONB),
                    :expires_at,
                    NOW()
                )
                ON CONFLICT (user_id, provider, page_id)
                WHERE page_id IS NOT NULL
                DO UPDATE SET
                    page_name = EXCLUDED.page_name,
                    page_access_token = EXCLUDED.page_access_token,
                    instagram_business_account_id = EXCLUDED.instagram_business_account_id,
                    instagram_username = EXCLUDED.instagram_username,
                    status = 'connected',
                    scopes = EXCLUDED.scopes,
                    raw = EXCLUDED.raw,
                    expires_at = EXCLUDED.expires_at,
                    updated_at = NOW()
                RETURNING
                    id,
                    user_id,
                    provider,
                    page_id,
                    page_name,
                    instagram_business_account_id,
                    instagram_username,
                    status,
                    scopes,
                    expires_at,
                    created_at,
                    updated_at;
                """
            ),
            {
                "user_id": str(user_id),
                "page_id": page_id,
                "page_name": page_name,
                "page_access_token": page_access_token,
                "instagram_business_account_id": str(instagram_business_id) if instagram_business_id else None,
                "instagram_username": instagram_username,
                "status": "connected",
                "scopes": json.dumps(scopes or META_SCOPES, ensure_ascii=False),
                "raw": json.dumps(raw, ensure_ascii=False),
                "expires_at": user_token_expires_at.replace(tzinfo=None) if user_token_expires_at else None,
            },
        ).mappings().first()

    return _serialize_social_account(row)


def _serialize_social_account(row):
    if not row:
        return None

    scopes = row.get("scopes") or []
    if isinstance(scopes, str):
        try:
            scopes = json.loads(scopes)
        except Exception:
            scopes = []

    return {
        "id": row.get("id"),
        "userId": row.get("user_id"),
        "provider": row.get("provider") or "meta",
        "platform": "instagram" if row.get("instagram_business_account_id") else "facebook",
        "pageId": row.get("page_id"),
        "pageName": row.get("page_name"),
        "instagramBusinessAccountId": row.get("instagram_business_account_id"),
        "instagramUsername": row.get("instagram_username"),
        "status": row.get("status") or "connected",
        "scopes": scopes,
        "expiresAt": _iso(row.get("expires_at")),
        "createdAt": _iso(row.get("created_at")),
        "updatedAt": _iso(row.get("updated_at")),
    }


@oauth_meta_bp.route("/api/oauth/facebook/start", methods=["GET", "OPTIONS"])
def meta_oauth_start():
    if request.method == "OPTIONS":
        return jsonify({"ok": True})

    ok, missing = _require_meta_config()
    if not ok:
        return _json_error(
            "Faltan variables de entorno para Meta OAuth",
            500,
            missing=missing,
        )

    user_id = _get_user_key()

    if not user_id or user_id == "anonymous":
        return _json_error("No se pudo identificar el usuario para conectar Meta", 401)

    state = _encode_oauth_state(user_id)

    session["meta_oauth_state"] = state
    session["meta_oauth_user_id"] = user_id
    session["meta_oauth_started_at"] = int(time.time())

    params = {
        "client_id": META_APP_ID,
        "redirect_uri": META_REDIRECT_URI,
        "state": state,
        "response_type": "code",
        "scope": ",".join(META_SCOPES),
    }

    if META_CONFIG_ID:
        params["config_id"] = META_CONFIG_ID

    login_url = f"{META_DIALOG_URL}?{urlencode(params)}"

    return jsonify(
        {
            "ok": True,
            "success": True,
            "loginUrl": login_url,
            "redirectUri": META_REDIRECT_URI,
            "scopes": META_SCOPES,
            "configId": META_CONFIG_ID,
        }
    )


@oauth_meta_bp.route("/api/oauth/facebook/callback", methods=["GET", "OPTIONS"])
def meta_oauth_callback():
    if request.method == "OPTIONS":
        return jsonify({"ok": True})

    ok, missing = _require_meta_config()
    if not ok:
        return redirect(
            _frontend_redirect(
                "/settings",
                meta="error",
                reason="missing_meta_env",
                missing=",".join(missing),
            )
        )

    error = request.args.get("error")
    error_reason = request.args.get("error_reason")
    error_description = request.args.get("error_description")

    if error:
        logger.warning(
            "Meta OAuth cancelado/error: %s %s %s",
            error,
            error_reason,
            error_description,
        )
        return redirect(
            _frontend_redirect(
                "/settings",
                meta="cancelled",
                reason=error_reason or error,
            )
        )

    code = request.args.get("code")
    received_state = request.args.get("state")
    expected_state = session.get("meta_oauth_state")

    if not code:
        return redirect(
            _frontend_redirect(
                "/settings",
                meta="error",
                reason="missing_code",
            )
        )

    if expected_state and received_state != expected_state:
        logger.warning("Meta OAuth state inválido")
        return redirect(
            _frontend_redirect(
                "/settings",
                meta="error",
                reason="invalid_state",
            )
        )

    user_id = (
        _decode_oauth_state(received_state)
        or session.get("meta_oauth_user_id")
        or _get_user_key()
    )

    if not user_id or user_id == "anonymous":
        logger.warning("Meta OAuth callback sin user_id válido")
        return redirect(
            _frontend_redirect(
                "/settings",
                meta="error",
                reason="missing_user",
            )
        )    

    try:
        short_token, short_expires_at, token_raw = _exchange_code_for_token(code)
        user_token, long_expires_at, long_raw = _exchange_for_long_lived_token(short_token)

        expires_at = long_expires_at or short_expires_at

        pages = _get_pages(user_token)
        logger.warning("PAGES META: %s", pages)

        saved_accounts = []
        for page in pages:
            if page.get("id") and page.get("access_token"):
                try:
                    page_details = _graph_get(
                        page.get("id"),
                        {
                            "access_token": page.get("access_token"),
                            "fields": "instagram_business_account{id,username}",
                        },
                    )

                    if page_details.get("instagram_business_account"):
                        page["instagram_business_account"] = page_details.get("instagram_business_account")

                except Exception as exc:
                    logger.warning(
                        "No se pudo obtener Instagram para page_id=%s: %s",
                        page.get("id"),
                        exc,
                    )

                saved = _save_social_account(
                    user_id=user_id,
                    page=page,
                    user_token_expires_at=expires_at,
                    scopes=META_SCOPES,
                )
                if saved:
                    saved_accounts.append(saved)

        session.pop("meta_oauth_state", None)
        session.pop("meta_oauth_user_id", None)
        session.pop("meta_oauth_started_at", None)

        if not saved_accounts:
            logger.warning("Meta OAuth OK pero sin páginas administrables para user_id=%s", user_id)
            return redirect(
                _frontend_redirect(
                    "/settings",
                    meta="warning",
                    reason="no_pages",
                )
            )

        logger.info(
            "Meta OAuth conectado para user_id=%s accounts=%s",
            user_id,
            len(saved_accounts),
        )

        return redirect(
            _frontend_redirect(
                "/settings",
                meta="connected",
                accounts=len(saved_accounts),
            )
        )

    except Exception as exc:
        logger.exception("Error en Meta OAuth callback: %s", exc)
        return redirect(
            _frontend_redirect(
                "/settings",
                meta="error",
                reason="callback_failed",
            )
        )


@oauth_meta_bp.route("/api/social-accounts", methods=["GET", "OPTIONS"])
def list_social_accounts():
    if request.method == "OPTIONS":
        return jsonify({"ok": True})

    user_id = _get_user_key()

    if not db_available():
        return jsonify([])

    _ensure_social_accounts_table()

    with db_session() as db:
        rows = db.execute(
            text(
                """
                SELECT
                    id,
                    user_id,
                    provider,
                    page_id,
                    page_name,
                    instagram_business_account_id,
                    instagram_username,
                    status,
                    scopes,
                    expires_at,
                    created_at,
                    updated_at
                FROM social_accounts
                WHERE user_id = :user_id
                  AND status != 'deleted'
                ORDER BY updated_at DESC, created_at DESC;
                """
            ),
            {"user_id": str(user_id)},
        ).mappings().all()

    accounts = [_serialize_social_account(row) for row in rows]

    return jsonify(accounts)


@oauth_meta_bp.route("/api/social-accounts/<int:account_id>", methods=["DELETE", "OPTIONS"])
def disconnect_social_account(account_id):
    if request.method == "OPTIONS":
        return jsonify({"ok": True})

    user_id = _get_user_key()

    if not db_available():
        return _json_error("DATABASE_URL no está configurada", 500)

    _ensure_social_accounts_table()

    with db_session() as db:
        row = db.execute(
            text(
                """
                UPDATE social_accounts
                SET status = 'deleted',
                    updated_at = NOW()
                WHERE id = :account_id
                  AND user_id = :user_id
                RETURNING id;
                """
            ),
            {
                "account_id": int(account_id),
                "user_id": str(user_id),
            },
        ).mappings().first()

    if not row:
        return _json_error("Cuenta social no encontrada", 404)

    return jsonify(
        {
            "ok": True,
            "success": True,
            "deleted": True,
            "id": account_id,
        }
    )


@oauth_meta_bp.route("/api/oauth/facebook/status", methods=["GET", "OPTIONS"])
def meta_oauth_status():
    if request.method == "OPTIONS":
        return jsonify({"ok": True})

    ok, missing = _require_meta_config()

    return jsonify(
        {
            "ok": ok,
            "success": ok,
            "provider": "meta",
            "configured": ok,
            "missing": missing,
            "redirectUri": META_REDIRECT_URI if ok else None,
            "configId": META_CONFIG_ID,
            "scopes": META_SCOPES,
            "frontendUrl": FRONTEND_URL,
        }
    )
