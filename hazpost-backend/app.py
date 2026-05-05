import os
import uuid
import fcntl
import logging

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from flask import Flask, render_template, request, make_response, jsonify, session, redirect
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
from werkzeug.utils import secure_filename

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
logger = logging.getLogger(__name__)

from src.security import init_security
from src.security_routes import security_bp
from src.seo import seo_bp
from src.monitor import monitor_bp, check_site_status
from src.scanner import scanner_bp, run_full_scan
from src.backup import backup_bp, run_backup
from src.github_backup import run_github_backup
from src.escaneo_imagenes import run_image_scan
from src.auto_actualizacion import check_and_update
from src.imagenes_routes import imagenes_bp
from src.duplicados import duplicados_bp
from src.aislamiento import aislamiento_bp
from src.aprendizaje_colectivo import aprendizaje_bp
from src.catalogs.industries import get_industries_response
from src.dashboard_routes import dashboard_bp
from src.oauth_meta_routes import oauth_meta_bp
from src.image_generation_routes import image_generation_bp
from src.db import (
    init_db,
    db_available,
    get_brand_profile,
    save_brand_profile,
    save_post,
    get_text_blocks,
    save_text_block,
)

R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")


def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT_URL,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    )


_SCHEDULER_LOCK_FILE = None


# ============================================================
# TEMP STORE — Persistencia temporal por usuario
# ============================================================
# CTO NOTE:
# Esto reemplaza dependencia de session (que falla en Railway/Vercel)
# Es temporal hasta migrar a PostgreSQL
# ============================================================
TEMP_USER_DATA = {}

OWNER_ADMIN_EMAIL = "admin@hazpost.app"


def _get_user_role(email: str) -> str:
    clean_email = (email or "").strip().lower()
    if clean_email == OWNER_ADMIN_EMAIL:
        return "admin"
    return "user"
    
def _get_user_key():
    return "global"
 
def _get_user_store():
    user_key = _get_user_key()
    if user_key not in TEMP_USER_DATA:
        TEMP_USER_DATA[user_key] = {
            "brandProfile": {},
            "businesses": [],
            "posts": [],
            "textBlocks": []  # 🔥 NUEVO
        }
    return TEMP_USER_DATA[user_key]


# ============================================================
# CORS CENTRALIZADO HAZPOST
# ============================================================
# IMPORTANTE:
# - No borrar dominios viejos: así no rompemos producción, Vercel ni localhost.
# - Si agregas otro frontend, agrégalo aquí o en Railway con CORS_ORIGIN.
# - CORS_ORIGIN puede traer varios dominios separados por coma.
#   Ejemplo:
#   CORS_ORIGIN=https://hazpost-frontend.vercel.app,https://hazpost.app
# ============================================================
DEFAULT_ALLOWED_ORIGINS = [
    "https://app.hazpost.app",   # 🔥 ESTE ES EL IMPORTANTE
    "https://hazpost-frontend.vercel.app",
    "https://hazpost.app",
    "https://www.hazpost.app",
    "https://hazpost.com",
    "https://www.hazpost.com",
    "https://v2.hazpost.com",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]

DEFAULT_ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
DEFAULT_ALLOWED_HEADERS = (
    "Content-Type, Authorization, X-Requested-With, X-API-Key, X-User-ID, "
    "Accept, Origin, Cache-Control, Pragma"
)


def _normalize_origin(origin: str | None) -> str:
    if not origin:
        return ""
    return origin.strip().rstrip("/")


def _get_allowed_origins() -> list[str]:
    env_origins = [
        _normalize_origin(origin)
        for origin in os.getenv("CORS_ORIGIN", "").split(",")
        if _normalize_origin(origin)
    ]

    origins = [_normalize_origin(origin) for origin in DEFAULT_ALLOWED_ORIGINS]
    return list(dict.fromkeys(origins + env_origins))


def _is_origin_allowed(origin: str | None) -> bool:
    clean_origin = _normalize_origin(origin)
    if not clean_origin:
        return False
    return clean_origin in _get_allowed_origins()


def _attach_cors_headers(response):
    origin = request.headers.get("Origin")
    clean_origin = _normalize_origin(origin)

    if _is_origin_allowed(clean_origin):
        response.headers["Access-Control-Allow-Origin"] = clean_origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"

    requested_headers = request.headers.get("Access-Control-Request-Headers")
    response.headers["Access-Control-Allow-Methods"] = DEFAULT_ALLOWED_METHODS
    response.headers["Access-Control-Allow-Headers"] = requested_headers or DEFAULT_ALLOWED_HEADERS
    response.headers["Access-Control-Max-Age"] = "86400"

    return response


def _apply_cors(app: Flask):
    allowed_origins = _get_allowed_origins()
    logger.info(f"CORS allowed origins: {allowed_origins}")

    @app.before_request
    def handle_cors_preflight():
        if request.method != "OPTIONS":
            return None

        response = make_response("", 204)
        return _attach_cors_headers(response)

    @app.after_request
    def add_cors_headers(response):
        return _attach_cors_headers(response)


# ============================================================
# SCHEDULER LOCK
# ============================================================
def _try_acquire_scheduler_lock(data_dir: str):
    lock_path = os.path.join(data_dir, '.scheduler.lock')
    os.makedirs(data_dir, exist_ok=True)
    try:
        lock_file = open(lock_path, 'w')
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return lock_file
    except (IOError, OSError):
        return None


# ============================================================
# CREATE APP
# ============================================================
def create_app():
    global _SCHEDULER_LOCK_FILE

    app = Flask(__name__)

    # 🔐 SECRET
    app.config['SECRET_KEY'] = os.getenv(
        'SECRET_KEY',
        'dev-secret-key-change-in-production'
    )

    # 🍪 COOKIES / SESIÓN
    # Railway + Gunicorn = NO usar filesystem en /tmp
    # Flask usará sesión firmada en cookie, estable entre requests.
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'None'
    app.config['SESSION_COOKIE_SECURE'] = True
    app.config['SESSION_COOKIE_DOMAIN'] = ".hazpost.app"
    app.config["SESSION_PERMANENT"] = True
    app.config['PERMANENT_SESSION_LIFETIME'] = 60 * 60 * 24 * 7

    # ⚙️ CONFIG
    app.config['DEBUG'] = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'

    # 🌐 CORS
    _apply_cors(app)

    # 🗄️ DB
    init_db()

    # 🔒 SEGURIDAD
    init_security(app)

    # 🔗 BLUEPRINTS BASE
    app.register_blueprint(seo_bp)
    app.register_blueprint(security_bp, url_prefix='/api/security')
    app.register_blueprint(monitor_bp, url_prefix='/api/monitor')
    app.register_blueprint(scanner_bp, url_prefix='/api/scanner')
    app.register_blueprint(backup_bp, url_prefix='/api/backup')
    app.register_blueprint(imagenes_bp, url_prefix='/api/imagenes')
    app.register_blueprint(duplicados_bp, url_prefix='/api/duplicados')
    app.register_blueprint(aislamiento_bp, url_prefix='/api/aislamiento')
    app.register_blueprint(aprendizaje_bp, url_prefix='/api/aprendizaje')

    # ============================================================
    # 👇 TODAS TUS RUTAS VAN AQUÍ (NO BORRAR)
    # ============================================================

    # ⚠️ Aquí deben estar tus rutas reales:
    # /api/user/login
    # /api/user/me
    # /api/user/logout
    # /api/plans (EL COMPLETO, no el vacío)

    # (NO dejes esto vacío en producción)

    # ============================================================
    # PUBLIC PLANS — Registro / Pricing
    # ============================================================
    @app.route('/api/plans', methods=['GET'])
    def get_public_plans():
        plans = [
            {
                "key": "free",
                "name": "Gratis",
                "priceUsd": 0,
                "priceCop": 0,
                "creditsPerMonth": 40,
                "descriptionJson": {
                    "description": "Para comenzar sin costo",
                    "features": [
                        "40 créditos para probar HazPost",
                        "1 negocio incluido",
                        "Genera contenido automáticamente",
                        "Publica en Instagram, TikTok y Facebook",
                        "Calendario y programación",
                        "Publicación masiva y cola de aprobación",
                    ],
                    "cta": "Probar gratis",
                },
            },
            {
                "key": "starter",
                "name": "Emprendedor",
                "priceUsd": 29.99,
                "priceCop": 119000,
                "creditsPerMonth": 30,
                "descriptionJson": {
                    "description": "Ideal para emprendedores en crecimiento",
                    "features": [
                        "Programa hasta 30 posts",
                        "Contenido constante para tu negocio",
                        "1 negocio incluido",
                        "Genera contenido automáticamente",
                        "Publica en Instagram, TikTok y Facebook",
                        "Calendario y programación",
                    ],
                    "cta": "Quiero empezar",
                },
            },
            {
                "key": "business",
                "name": "Negocio",
                "priceUsd": 49.99,
                "priceCop": 199000,
                "creditsPerMonth": 60,
                "descriptionJson": {
                    "description": "Para marcas y equipos establecidos",
                    "badge": "Más popular",
                    "features": [
                        "Programa hasta 60 posts",
                        "Más contenido, más formatos y más automatización",
                        "1 negocio incluido",
                        "Genera contenido automáticamente",
                        "Publica en Instagram, TikTok y Facebook",
                        "Calendario y programación",
                        "Publicación masiva y cola de aprobación",
                        "Tu tono y estilo de marca guardados",
                    ],
                    "cta": "Escalar mi negocio 🚀",
                },
            },
            {
                "key": "agency",
                "name": "Agencia",
                "priceUsd": 199.99,
                "priceCop": 799000,
                "creditsPerMonth": 250,
                "descriptionJson": {
                    "description": "Para agencias y múltiples marcas",
                    "badge": "Pro",
                    "features": [
                        "Contenido masivo para múltiples marcas",
                        "Hasta 5 negocios incluidos",
                        "Gestiona más de una marca",
                        "Todo lo del plan Negocio incluido",
                        "Negocios adicionales por $29.99 USD/mes",
                    ],
                    "cta": "Automatizar todo",
                },
            },
        ]

        return jsonify({
            "plans": plans,
            "creditPack": {
                "credits": 100,
                "priceUsd": 19.99,
            },
        })


    # ============================================================
    # LOGIN USER — Compatibilidad frontend HazPost
    # ============================================================
    @app.route('/api/user/login', methods=['POST'])
    def login_user():
        try:
            data = request.get_json(silent=True) or {}

            email = (data.get("email") or "").strip().lower()
            password = data.get("password") or ""

            if not email or not password:
                return jsonify({
                    "success": False,
                    "error": "Email y contraseña requeridos"
                }), 400

            user = {
                "id": 1,
                "email": email,
                "displayName": email.split("@")[0],
                "role": _get_user_role(email),
                "plan": "free",
                "aiCredits": 40,
                "onboardingStep": 1,
                "emailVerified": True,
                "avatarUrl": None,
                "timezone": "America/Bogota",
            }

            subscription = {
                "id": 1,
                "userId": user["id"],
                "plan": user["plan"],
                "status": "active",
                "creditsRemaining": user["aiCredits"],
                "creditsTotal": user["aiCredits"],
                "periodEnd": None,
            }

            session.clear()
            session["user"] = user
            session["subscription"] = subscription
            session.permanent = True
            session.modified = True  # 🔥 IMPORTANTE

            return jsonify({
                "success": True,
                "user": user,
                "subscription": subscription,
            })

        except Exception as e:
            logger.exception(f"LOGIN ERROR: {e}")
            return jsonify({"error": "Error interno"}), 500

    # ============================================================
    # USER ME — Obtener y actualizar datos del usuario
    # ============================================================
    @app.route('/api/user/me', methods=['GET', 'PUT'])
    def user_me():
        try:
            user = session.get("user")

            # 🔒 VALIDACIÓN REAL (NO fallback falso)
            if not isinstance(user, dict) or not user:
                return jsonify({
                    "success": False,
                    "error": "No autenticado"
                }), 401

            # 📦 Subscription segura
            subscription = session.get("subscription") or {
                "id": user.get("id"),
                "userId": user.get("id"),
                "plan": user.get("plan", "free"),
                "status": "active",
                "creditsRemaining": user.get("aiCredits", 40),
                "creditsTotal": user.get("aiCredits", 40),
                "periodEnd": None,
            }

            # ====================================================
            # GET
            # ====================================================
            if request.method == 'GET':
                session.permanent = True
                session.modified = True

                return jsonify({
                    "success": True,
                    "user": user,
                    "subscription": subscription
                })

            # ====================================================
            # PUT
            # ====================================================
            data = request.get_json(silent=True) or {}

            updated_user = {
                **user,
                "displayName": data.get("displayName") or user.get("displayName") or "",
                "email": user.get("email"),  # 🔒 no se toca
            }

            session["user"] = updated_user
            session["subscription"] = subscription
            session.permanent = True
            session.modified = True

            return jsonify({
                "success": True,
                "user": updated_user,
                "subscription": subscription
            })

        except Exception as e:
            logger.exception(f"USER ME ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error interno"
            }), 500


    # ============================================================
    # LOGOUT
    # ============================================================
    @app.route('/api/user/logout', methods=['POST'])
    def user_logout():
        session.clear()
        session.modified = True  # 🔥 importante
        return jsonify({"success": True})

    
    # ============================================================
    # USER BOOTSTRAP — Compatibilidad frontend
    # ============================================================
    @app.route('/api/user/bootstrap', methods=['GET'])
    def user_bootstrap():
        return jsonify({
            "success": True,
            "hasUsers": True
        })

    
    # ============================================================
    # REGISTER USER — Registro desde frontend
    # ============================================================
    @app.route('/api/user/register', methods=['POST'])
    def register_user():
        try:
            data = request.get_json(silent=True) or {}

            email = (data.get("email") or "").strip().lower()
            password = data.get("password") or ""
            display_name = data.get("displayName") or data.get("name") or ""
            affiliate_code = data.get("affiliateCode")
            referral_code = data.get("referralCode")
            selected_plan = data.get("selectedPlan")
            logo_url = data.get("logoUrl")
            primary_color = data.get("primaryColor")

            if not email or not password:
                return jsonify({
                    "success": False,
                    "error": "Email y contraseña requeridos"
                }), 400

            user = {
                "id": 1,
                "email": email,
                "displayName": display_name or email.split("@")[0],
                "role": _get_user_role(email),
                "plan": selected_plan or "free",
                "aiCredits": 40,
                "onboardingStep": 1,
                "emailVerified": False,
                "avatarUrl": None,
                "timezone": "America/Bogota",
            }

            subscription = {
                "id": 1,
                "userId": user["id"],
                "plan": selected_plan or "free",
                "status": "active",
                "creditsRemaining": 40,
                "creditsTotal": 40,
                "periodEnd": None,
            }

            session.clear()
            session["user"] = user
            session["subscription"] = subscription
            session.permanent = True
            session.modified = True

            return jsonify({
                "success": True,
                "user": user,
                "subscription": subscription,
                "pendingPlan": selected_plan if selected_plan and selected_plan != "free" else None,
                "affiliateCode": affiliate_code,
                "referralCode": referral_code,
                "logoUrl": logo_url,
                "primaryColor": primary_color,
            }), 201

        except Exception as e:
            logger.exception(f"REGISTER ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error interno"
            }), 500


    # ============================================================
    # INDUSTRIES — Dropdown onboarding
    # ============================================================
    @app.route('/api/industries', methods=['GET'])
    def get_industries():
        try:
            response = jsonify(get_industries_response())
            response.headers["Cache-Control"] = "public, max-age=3600"
            return response

        except Exception as e:
            logger.exception(f"INDUSTRIES ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error interno"
            }), 500

    # ============================================================
    # INDUSTRY SUGGESTIONS — Guardar nuevas industrias
    # ============================================================
    @app.route('/api/industries/suggestions', methods=['POST'])
    def save_industry_suggestion_api():
        try:
            data = request.get_json(silent=True) or {}
            name = data.get("name")

            if not name or not name.strip():
                return jsonify({
                    "success": False,
                    "error": "Nombre requerido"
                }), 400

            from src.catalogs.industry_suggestions import save_industry_suggestion

            result = save_industry_suggestion(name)

            return jsonify({
                "success": True,
                "result": result
            })

        except Exception as e:
            logger.exception(f"SUGGESTION ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error interno"
            }), 500


    # ============================================================
    # BRAND PROFILE — Guardado progreso onboarding
    # ============================================================
    @app.route('/api/brand-profile', methods=['GET', 'PUT', 'POST'])
    def brand_profile():
        try:
            user = session.get("user") or {}
            user_id = str(user.get("email") or user.get("id") or "anonymous")

            # ============================
            # GET
            # ============================
            if request.method == 'GET':
                brand_profile_data = {}

                # 1. Leer por user_id real
                if db_available():
                    brand_profile_data = get_brand_profile(user_id)

                # 2. Fallback a anonymous + migración automática
                if not brand_profile_data and user_id != "anonymous":
                    anonymous_profile = {}

                    if db_available():
                        anonymous_profile = get_brand_profile("anonymous")

                    if not anonymous_profile:
                        store = _get_user_store()
                        anonymous_profile = (
                            store.get("brandProfile")
                            or session.get("brandProfile")
                            or {}
                        )

                    if anonymous_profile:
                        logger.info(f"MIGRANDO BRAND PROFILE de anonymous a {user_id}")

                        if db_available():
                            save_brand_profile(user_id, anonymous_profile)

                        store = _get_user_store()
                        store["brandProfile"] = anonymous_profile

                        session["brandProfile"] = anonymous_profile
                        session.permanent = True
                        session.modified = True

                        brand_profile_data = anonymous_profile

                # 3. Fallback final (solo si no hay nada en DB)
                if not brand_profile_data:
                    store = _get_user_store()
                    brand_profile_data = (
                        store.get("brandProfile")
                        or session.get("brandProfile")
                        or {}
                    )

                logger.info(f"LEYENDO BRAND PROFILE user_id={user_id}: {brand_profile_data}")

                return jsonify({
                    "brandProfile": brand_profile_data
                })

            # ============================
            # PUT / POST
            # ============================
            data = request.get_json(silent=True) or {}
            logger.info(f"DATA RECIBIDA BRAND PROFILE user_id={user_id}: {data}")

            current = {}

            if db_available():
                current = get_brand_profile(user_id)

                if not current and user_id != "anonymous":
                    anonymous_profile = get_brand_profile("anonymous")
                    if anonymous_profile:
                        logger.info(f"USANDO BRAND PROFILE anonymous como base para {user_id}")
                        current = anonymous_profile

            if not current:
                current = session.get("brandProfile", {})

            if not isinstance(current, dict):
                current = {}

            allowed_keys = [
                "id",
                "companyName",
                "name",
                "industry",
                "subIndustry",
                "subIndustries",
                "city",
                "country",
                "slogan",
                "businessDescription",
                "description",
                "audience",
                "audienceDescription",
                "targetAudience",
                "brandTone",
                "tone",
                "logoUrl",
                "logoUrls",
                "referenceImages",
                "primaryColor",
                "secondaryColor",
                "website",
                "onboardingStep",
                "onboardingCompleted",
            ]

            cleaned = {
                key: data.get(key)
                for key in allowed_keys
                if key in data and data.get(key) is not None
            }

            if cleaned.get("audienceDescription") and not cleaned.get("audience"):
                cleaned["audience"] = cleaned["audienceDescription"]

            if cleaned.get("targetAudience") and not cleaned.get("audience"):
                cleaned["audience"] = cleaned["targetAudience"]

            if cleaned.get("description") and not cleaned.get("businessDescription"):
                cleaned["businessDescription"] = cleaned["description"]

            if cleaned.get("businessDescription") and not cleaned.get("description"):
                cleaned["description"] = cleaned["businessDescription"]

            if cleaned.get("tone") and not cleaned.get("brandTone"):
                cleaned["brandTone"] = cleaned["tone"]

            if cleaned.get("brandTone") and not cleaned.get("tone"):
                cleaned["tone"] = cleaned["brandTone"]

            if cleaned.get("companyName") and not cleaned.get("name"):
                cleaned["name"] = cleaned["companyName"]

            if cleaned.get("name") and not cleaned.get("companyName"):
                cleaned["companyName"] = cleaned["name"]

            profile = {
                **current,
                **cleaned,
                "id": current.get("id") or cleaned.get("id") or 1,
            }

            logger.info(f"GUARDANDO BRAND PROFILE user_id={user_id}: {profile}")

            if db_available():
                save_brand_profile(user_id, profile)

            store = _get_user_store()
            store["brandProfile"] = profile

            session["brandProfile"] = profile
            session.permanent = True
            session.modified = True

            return jsonify({
                "success": True,
                "brandProfile": profile,
            })

        except Exception as e:
            logger.exception(f"BRAND PROFILE ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error interno"
            }), 500
    # ============================================================
    # BUSINESSES — Guardado inicial del negocio
    # ============================================================
    @app.route('/api/businesses', methods=['GET', 'POST'])
    def businesses():
        try:
            # ============================
            # GET
            # ============================
            if request.method == 'GET':
                store = _get_user_store()
                businesses_list = store.get("businesses") or session.get("businesses", [])

                if not isinstance(businesses_list, list):
                    businesses_list = []

                return jsonify({"businesses": businesses_list})

            # ============================
            # POST
            # ============================
            data = request.get_json(silent=True) or {}

            store = _get_user_store()

            businesses_list = store.get("businesses") or session.get("businesses", [])
            if not isinstance(businesses_list, list):
                businesses_list = []

            business = {
                "id": len(businesses_list) + 1,
                **data,
            }

            businesses_list.append(business)

            store["businesses"] = businesses_list
            session["businesses"] = businesses_list

            current_brand_profile = store.get("brandProfile") or session.get("brandProfile") or {}

            if not isinstance(current_brand_profile, dict):
                current_brand_profile = {}

            synced_brand_profile = {
                **current_brand_profile,
                "id": business.get("id"),
                "companyName": business.get("companyName") or business.get("name") or current_brand_profile.get("companyName"),
                "industry": business.get("industry") or current_brand_profile.get("industry"),
                "subIndustry": business.get("subIndustry") or current_brand_profile.get("subIndustry"),
                "city": business.get("city") or current_brand_profile.get("city"),
                "country": business.get("country") or current_brand_profile.get("country"),
                "slogan": business.get("slogan") or current_brand_profile.get("slogan"),
                "businessDescription": (
                    business.get("businessDescription")
                    or business.get("description")
                    or current_brand_profile.get("businessDescription")
                ),
                "audience": business.get("audience") or current_brand_profile.get("audience"),
                "brandTone": business.get("brandTone") or business.get("tone") or current_brand_profile.get("brandTone"),
                "logoUrl": business.get("logoUrl") or current_brand_profile.get("logoUrl"),
                "primaryColor": business.get("primaryColor") or current_brand_profile.get("primaryColor"),
                "website": business.get("website") or current_brand_profile.get("website"),
            }

            store["brandProfile"] = synced_brand_profile

            session["brandProfile"] = synced_brand_profile
            session.permanent = True
            session.modified = True

            return jsonify({
                "success": True,
                "business": business,
                "businesses": businesses_list,
                "brandProfile": synced_brand_profile,
            }), 201

        except Exception as e:
            logger.exception(f"BUSINESSES ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error interno"
            }), 500


    # ============================================================
    # BUSINESS DETAIL — Editar / leer / borrar negocio por ID
    # ============================================================
    @app.route('/api/businesses/<int:business_id>', methods=['GET', 'PUT', 'PATCH', 'DELETE'])
    def business_detail(business_id):
        try:
            store = _get_user_store()

            businesses_list = store.get("businesses") or session.get("businesses", [])
            if not isinstance(businesses_list, list):
                businesses_list = []

            # Fallback seguro: si businesses está vacío, reconstruir desde brandProfile
            if not businesses_list:
                brand_profile = (
                    store.get("brandProfile")
                    or session.get("brandProfile")
                    or session.get("brand_profile")
                    or {}
                )

                if isinstance(brand_profile, dict) and brand_profile:
                    businesses_list = [{
                        **brand_profile,
                        "id": int(brand_profile.get("id") or business_id),
                        "name": (
                            brand_profile.get("name")
                            or brand_profile.get("companyName")
                            or "Mi negocio"
                        ),
                        "companyName": (
                            brand_profile.get("companyName")
                            or brand_profile.get("name")
                            or "Mi negocio"
                        ),
                        "isDefault": True,
                    }]

                    store["businesses"] = businesses_list
                    session["businesses"] = businesses_list
                    session.permanent = True
                    session.modified = True

            index = next(
                (i for i, business in enumerate(businesses_list)
                 if int(business.get("id", 0)) == business_id),
                None
            )

            if index is None:
                return jsonify({
                    "success": False,
                    "error": "Negocio no encontrado"
                }), 404

            # ============================
            # GET
            # ============================
            if request.method == 'GET':
                return jsonify({
                    "success": True,
                    "business": businesses_list[index]
                })

            # ============================
            # DELETE
            # ============================
            if request.method == 'DELETE':
                deleted = businesses_list.pop(index)
                session["businesses"] = businesses_list
                session.permanent = True
                session.modified = True

                return jsonify({
                    "success": True,
                    "business": deleted
                })

            # ============================
            # PUT / PATCH
            # ============================
            data = request.get_json(silent=True) or {}

            updated_business = {
                **businesses_list[index],
                **data,
                "id": business_id,
            }

            businesses_list[index] = updated_business
            session["businesses"] = businesses_list

            # 🔥 Sync con brand profile
            current_brand_profile = session.get("brandProfile", {})
            if not isinstance(current_brand_profile, dict):
                current_brand_profile = {}

            synced_brand_profile = {
                **current_brand_profile,
                "id": updated_business.get("id"),
                "companyName": updated_business.get("companyName") or updated_business.get("name") or current_brand_profile.get("companyName"),
                "industry": updated_business.get("industry") or current_brand_profile.get("industry"),
                "subIndustry": updated_business.get("subIndustry") or current_brand_profile.get("subIndustry"),
                "city": updated_business.get("city") or current_brand_profile.get("city"),
                "country": updated_business.get("country") or current_brand_profile.get("country"),
                "slogan": updated_business.get("slogan") or current_brand_profile.get("slogan"),
                "businessDescription": (
                    updated_business.get("businessDescription")
                    or updated_business.get("description")
                    or current_brand_profile.get("businessDescription")
                ),
                "audience": updated_business.get("audience") or current_brand_profile.get("audience"),
                "brandTone": updated_business.get("brandTone") or updated_business.get("tone") or current_brand_profile.get("brandTone"),
                "logoUrl": updated_business.get("logoUrl") or current_brand_profile.get("logoUrl"),
                "primaryColor": updated_business.get("primaryColor") or current_brand_profile.get("primaryColor"),
                "website": updated_business.get("website") or current_brand_profile.get("website"),
            }

            session["brandProfile"] = synced_brand_profile
            session.permanent = True
            session.modified = True

            return jsonify({
                "success": True,
                "business": updated_business,
                "brandProfile": synced_brand_profile,
            })

        except Exception as e:
            logger.exception(f"BUSINESS DETAIL ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error interno"
            }), 500

    # ============================================================
    # ROOT + HEALTH
    # ============================================================
    @app.route('/')
    def index():
        return {"status": "ok"}

    @app.route('/health')
    def health():
        return {"status": "ok"}


    # ============================================================
    # SETTINGS / AUTOMATION STUBS
    # ============================================================
    @app.route('/api/devices', methods=['GET'])
    def devices():
        return jsonify([])


    @app.route('/api/telegram', methods=['GET'])
    def telegram():
        return jsonify({
            "connected": False,
            "enabled": False,
            "status": "inactive",
        })


    @app.route('/api/auto-gen', methods=['GET'])
    def auto_gen():
        return jsonify({
            "enabled": False,
            "status": "inactive",
        })


    @app.route('/api/backgrounds', methods=['GET'])
    def backgrounds():
        return jsonify([])


    @app.route('/api/summary', methods=['GET'])
    def summary():
        return jsonify({
            "total": 0,
            "successful": 0,
            "failed": 0,
            "auto": 0,
            "manual": 0,
        })


    @app.route('/api/my-trial', methods=['GET'])
    def my_trial():
        return jsonify({
            "active": True,
            "plan": "free",
            "creditsRemaining": 40,
            "creditsTotal": 40,
        })


    @app.route('/api/publish-log', methods=['GET'])
    def publish_log():
        return jsonify([])


    @app.route('/api/suggest', methods=['POST'])
    def suggest():
        return jsonify({
            "success": True,
            "suggestions": [],
        })


    # ============================================================
    # ANALYTICS / IA SUGERENCIAS
    # ============================================================
    @app.route('/api/analytics/posting-suggestions', methods=['GET'])
    def analytics_posting_suggestions():
        return jsonify({
            "hasRealData": False,
            "aiSlotsCount": 0,
            "suggestions": {
                "instagram": {},
                "tiktok": {},
                "facebook": {}
            },
            "items": [],
            "data": []
        })


    @app.route('/api/posting-suggestions', methods=['GET'])
    def posting_suggestions():
        return jsonify({
            "hasRealData": False,
            "aiSlotsCount": 0,
            "suggestions": {
                "instagram": {},
                "tiktok": {},
                "facebook": {}
            },
            "items": [],
            "data": []
        })


    @app.route('/api/analytics/summary', methods=['GET'])
    def analytics_summary():
        return jsonify({
            "overview": {
                "total": 0,
                "published": 0,
                "scheduled": 0,
                "pending": 0,
                "failed": 0,
                "likes": 0,
                "comments": 0,
                "shares": 0,
                "reach": 0,
                "saves": 0
            },
            "byContentType": [],
            "byDayOfWeek": [],
            "byHour": [],
            "byPlatform": [],
            "topPosts": []
        })


    @app.route('/api/analytics/content-insights', methods=['GET'])
    def analytics_content_insights():
        return jsonify({
            "typeRanking": [],
            "top3": [],
            "insights": []
        })


    @app.route('/api/analytics/hashtag-insights', methods=['GET'])
    def analytics_hashtag_insights():
        return jsonify({
            "byPool": [],
            "topHashtags": [],
            "hashtags": []
        })


    # ============================================================
    # ANALYTICS — Publishing cadence
    # ============================================================
    @app.route('/api/analytics/publishing-cadence', methods=['GET'])
    def analytics_publishing_cadence():
        return jsonify({
            "weeks": [],
            "currentWeekCount": 0,
            "avgPerWeek": 0,
            "totalInPeriod": 0
        })


    # ============================================================
    # GOOGLE LOGIN TEMPORAL — Admin directo
    # ============================================================
    @app.route('/api/auth/google', methods=['GET'])
    def google_login_temp_admin():
        user = {
            "id": 1,
            "email": "admin@hazpost.app",
            "displayName": "Admin HazPost",
            "role": "admin",
            "plan": "agency",
            "aiCredits": 250,
            "onboardingStep": 5,
            "emailVerified": True,
            "avatarUrl": None,
            "timezone": "America/Bogota",
        }

        subscription = {
            "id": 1,
            "userId": user["id"],
            "plan": "agency",
            "status": "active",
            "creditsRemaining": 250,
            "creditsTotal": 250,
            "periodEnd": None,
        }

        session.clear()
        session["user"] = user
        session["subscription"] = subscription
        session.permanent = True

        return """
        <script>
          window.location.href = "https://hazpost-frontend.vercel.app/dashboard";
        </script>
        """


    # ============================================================
    # ADMIN / AGENCY STUBS — Evita errores en panel admin/agencia
    # ============================================================
    @app.route('/api/user/admin/users', methods=['GET'])
    def user_admin_users():
        return jsonify({
            "users": [],
            "items": [],
            "data": [],
            "total": 0
        })


    @app.route('/api/users', methods=['GET'])
    def admin_users():
        return jsonify({
            "users": [],
            "items": [],
            "data": [],
            "total": 0
        })


    @app.route('/api/admin/users', methods=['GET'])
    def admin_users_alt():
        return user_admin_users()


    @app.route('/api/brand-profile/admin/all', methods=['GET'])
    def brand_profile_admin_all():
        return jsonify({
            "profiles": []
        })


    @app.route('/api/admin/metrics', methods=['GET'])
    def admin_metrics():
        return jsonify({
            "mrr": 0,
            "paidUsers": 0,
            "freeUsers": 0,
            "totalActive": 0,
            "conversionRate": 0,
            "newUsers7d": 0,
            "newUsers30d": 0,
            "credits": {
                "issued": 0,
                "consumed": 0,
                "avgRemaining": 0,
                "utilizationPct": 0
            },
            "posts": {
                "total": 0,
                "last7d": 0,
                "last30d": 0
            },
            "images": {
                "total": 0
            },
            "businesses": 0,
            "planBreakdown": [],
            "subStatuses": [],
            "referrals": {
                "rows": [],
                "total": 0
            },
            "affiliates": {
                "rows": [],
                "total": 0
            },
            "postsPerDay": [],
            "usersPerDay": []
        })


    @app.route('/api/metrics', methods=['GET'])
    def metrics_alias():
        return admin_metrics()


    @app.route('/api/admin/metrics/generation-costs', methods=['GET'])
    def admin_generation_costs():
        period = request.args.get("period", "today")
        return jsonify({
            "period": period,
            "from": "",
            "to": "",
            "seriesDays": 0,
            "byType": [],
            "totalCount": 0,
            "totalCostUsd": 0,
            "timeSeries": []
        })


    @app.route('/api/niches', methods=['GET'])
    def admin_niches():
        scope = request.args.get("scope")
        if scope == "all":
            return jsonify([])
        return jsonify([])


    @app.route('/api/all', methods=['GET'])
    def all_admin_data():
        return jsonify({
            "users": [],
            "businesses": [],
            "posts": [],
            "niches": [],
            "metrics": [],
            "items": [],
            "data": []
        })


    @app.route('/api/backgrounds-master', methods=['GET'])
    @app.route('/api/admin/backgrounds-master', methods=['GET'])
    def backgrounds_master():
        return jsonify({
            "backgrounds": [],
            "items": [],
            "data": [],
            "total": 0
        })


    @app.route('/api/conversations', methods=['GET'])
    @app.route('/api/admin/conversations', methods=['GET'])
    def conversations():
        return jsonify({
            "conversations": [],
            "items": [],
            "data": []
        })


    @app.route('/api/referrals', methods=['GET'])
    @app.route('/api/admin/affiliates', methods=['GET'])
    def referrals():
        return jsonify([])


    @app.route('/api/conversions', methods=['GET'])
    def conversions():
        return jsonify({})


    @app.route('/api/affiliate-settings', methods=['GET'])
    @app.route('/api/admin/affiliate-settings', methods=['GET'])
    def affiliate_settings():
        return jsonify({
            "enabled": False,
            "commission": 0,
            "settings": {},
            "items": [],
            "data": []
        })


    @app.route('/api/affiliate-codes', methods=['GET'])
    @app.route('/api/admin/affiliate-codes', methods=['GET'])
    def affiliate_codes():
        return jsonify([])


    @app.route('/api/codes', methods=['GET'])
    def codes():
        return jsonify([])


    @app.route('/api/billing/plans', methods=['GET'])
    def billing_plans():
        return jsonify({
            "plans": [],
            "items": [],
            "data": []
        })


    # ============================================================
    # REFERRALS ADMIN — evita error extra_niche
    # ============================================================
    @app.route('/api/admin/referrals/settings', methods=['GET', 'PUT'])
    def admin_referrals_settings():
        return jsonify({
            "id": None,
            "is_enabled": True,
            "referrer_credits": 30,
            "referee_credits": 10,
            "referrer_free_days": 0,
            "referee_free_days": 0,
            "min_plan_for_bonus": "starter",
            "max_activation_days": 60,
            "max_referrals_per_user": 0,
            "referrer_unlocks": {
                "extra_niche": False,
                "watermark_removal": False,
                "priority_generation": False,
                "custom_domain": False
            },
            "referee_unlocks": {
                "extra_niche": False,
                "watermark_removal": False,
                "priority_generation": False,
                "custom_domain": False
            },
            "updated_at": None
        })


    # ============================================================
    # STORAGE UPLOAD — Logos / imágenes onboarding
    # Cloudflare R2 — Producción SaaS
    # Debe ir ANTES del fallback.
    # ============================================================

    def _r2_ready():
        return all([
            R2_ACCESS_KEY_ID,
            R2_SECRET_ACCESS_KEY,
            R2_ENDPOINT_URL,
            R2_BUCKET_NAME,
            R2_PUBLIC_URL,
        ])


    def _r2_public_url(object_key: str) -> str:
        return f"{R2_PUBLIC_URL.rstrip('/')}/{object_key.lstrip('/')}"

    def _get_storage_user_key():
        data = request.get_json(silent=True) or {}

        raw_user_key = (
            request.args.get("userId")
            or request.headers.get("X-User-ID")
            or data.get("userId")
            or data.get("email")
        )

        if not raw_user_key:
            user = session.get("user") or {}
            raw_user_key = user.get("email") or user.get("id") or "anonymous"

        return secure_filename(str(raw_user_key)) or "anonymous"    


    # 👇 FUERA DE LA FUNCIÓN (sin indentación extra)
    @app.route('/api/storage/uploads/request-url', methods=['POST'])
    def storage_request_url():        
        try:
            data = request.get_json(silent=True) or {}
            original_name = data.get("name") or "upload.bin"
            content_type = data.get("contentType") or "application/octet-stream"
            size = data.get("size")

            safe_name = secure_filename(original_name) or "upload.bin"
            file_id = str(uuid.uuid4())
            stored_name = f"{file_id}_{safe_name}"
            user_key = _get_storage_user_key()
            object_key = f"uploads/{user_key}/{stored_name}"

            public_url = _r2_public_url(object_key)
            base_url = request.host_url.rstrip('/').replace('http://', 'https://')
            upload_url = f"{base_url}/api/storage/uploads/direct?filename={stored_name}&userId={user_key}"

            return jsonify({
                "success": True,
                "uploadURL": upload_url,
                "uploadUrl": upload_url,
                "upload_url": upload_url,
                "signedUrl": upload_url,
                "url": upload_url,
                "objectPath": f"/storage/objects/{object_key}",
                "publicUrl": public_url,
                "name": safe_name,
                "storedName": stored_name,
                "contentType": content_type,
                "size": size,
            })

        except Exception as e:
            logger.exception(f"STORAGE REQUEST URL ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error generando URL de subida"
            }), 500


    @app.route('/api/storage/uploads/direct', methods=['POST', 'PUT'])
    def storage_upload_direct():
        try:
            if not _r2_ready():
                logger.error("R2 CONFIG ERROR: variables R2 incompletas")
                return jsonify({
                    "success": False,
                    "error": "Storage no configurado"
                }), 500

            filename = request.args.get("filename") or f"{uuid.uuid4()}_upload.bin"
            safe_name = secure_filename(filename) or f"{uuid.uuid4()}_upload.bin"

            allowed_extensions = {"png", "jpg", "jpeg", "gif", "webp"}
            extension = safe_name.rsplit(".", 1)[-1].lower() if "." in safe_name else ""

            if extension not in allowed_extensions:
                return jsonify({
                    "success": False,
                    "error": "Tipo de archivo no permitido"
                }), 400

            user_key = _get_storage_user_key()
            object_key = f"uploads/{user_key}/{safe_name}"

            mime_map = {
                "png": "image/png",
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "gif": "image/gif",
                "webp": "image/webp"
            }

            content_type = mime_map.get(extension, "application/octet-stream")

            r2 = get_r2_client()

            logger.info(f"SUBIENDO A R2: {object_key}")

            if 'file' in request.files:
                uploaded_file = request.files['file']
                uploaded_file.stream.seek(0)

                r2.upload_fileobj(
                    uploaded_file,
                    R2_BUCKET_NAME,
                    object_key,
                    ExtraArgs={
                        "ContentType": content_type,
                    }
                )
            else:
                raw_file = request.get_data()

                if not raw_file:
                    return jsonify({
                        "success": False,
                        "error": "Archivo requerido"
                    }), 400

                r2.put_object(
                    Bucket=R2_BUCKET_NAME,
                    Key=object_key,
                    Body=raw_file,
                    ContentType=content_type,
                )

            logger.info(f"UPLOAD OK: {object_key}")

            public_url = _r2_public_url(object_key)

            return jsonify({
                "success": True,
                "url": public_url,
                "publicUrl": public_url,
                "objectPath": f"/storage/objects/{object_key}",
                "filename": safe_name,
            })

        except (BotoCoreError, ClientError) as e:
            logger.exception(f"R2 UPLOAD ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error subiendo archivo a R2"
            }), 500

        except Exception as e:
            logger.exception(f"STORAGE DIRECT UPLOAD ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error subiendo archivo"
            }), 500


    @app.route('/api/storage/objects/uploads/<path:filename>', methods=['GET'])
    @app.route('/storage/objects/uploads/<path:filename>', methods=['GET'])
    def storage_get_uploaded_object(filename):
        try:
            safe_name = secure_filename(filename)

            if not safe_name:
                return jsonify({"error": "Archivo inválido"}), 400

            if "/" in filename:
                public_url = _r2_public_url(f"uploads/{filename.lstrip('/')}")
            else:
                user = session.get("user") or {}
                user_key = secure_filename(str(user.get("email") or user.get("id") or "anonymous"))
                public_url = _r2_public_url(f"uploads/{user_key}/{safe_name}")

            return redirect(public_url, code=302)

        except Exception as e:
            logger.exception(f"STORAGE GET OBJECT ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Archivo no encontrado"
            }), 404
            
    # ============================================================
    # ANALYZE WEBSITE — IA onboarding (MVP funcional)
    # ============================================================
    @app.route('/api/analyze-website', methods=['POST'])
    def analyze_website():
        try:
            data = request.get_json(silent=True) or {}

            website = (data.get("website") or data.get("url") or "").strip()
            company_name = (data.get("companyName") or "").strip()
            slogan = (data.get("slogan") or "").strip()
            industry = (data.get("industry") or "").strip()
            sub_industry = (data.get("subIndustry") or "").strip()
            city = (data.get("city") or "").strip()
            country = (data.get("country") or "").strip()

            if not website:
                return jsonify({
                    "success": False,
                    "error": "Website requerido"
                }), 400

            business_name = company_name or "Tu negocio"
            business_type = sub_industry or industry or "productos y servicios"
            location = city or country or "tu región"

            description = (
                f"{business_name} es un negocio de {business_type} en {location}, "
                f"enfocado en {slogan.lower() if slogan else 'ofrecer productos y servicios de calidad, generando confianza y una excelente experiencia al cliente'}."
            )

            audience = (
                f"Personas interesadas en {business_type} en {location}, "
                f"que buscan confianza, buen servicio y una marca que les ayude a tomar decisiones de compra fácilmente."
            )

            return jsonify({
                "success": True,
                "description": description,
                "audience": audience,
                "tone": "cercano",
                "primaryColor": "#2563eb"
            })

        except Exception as e:
            logger.exception(f"ANALYZE WEBSITE ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error analizando sitio web"
            }), 500

    # ============================================================
    # GENERATE FIRST POST — WOW moment dashboard + IA real
    # ============================================================
    @app.route('/api/generate-first-post', methods=['POST'])
    def generate_first_post():
        try:
            import json
            from openai import OpenAI

            # 🔥 LEER BODY SIEMPRE
            body = request.get_json(silent=True) or {}

            # 🔥 NUEVO: tipo de post (SIEMPRE definido)
            post_type = (body.get("postType") or "auto").lower()

            # 🔥 PERFIL: store → session → request
            store = _get_user_store()
            profile = store.get("brandProfile") or session.get("brandProfile")
            
            user = session.get("user") or {}
            user_id = str(user.get("email") or user.get("id") or "anonymous")

            if db_available() and user_id != "anonymous":
                db_profile = get_brand_profile(user_id)
                if isinstance(db_profile, dict) and db_profile:
                    profile = db_profile
            if not profile:
                profile = body.get("brandProfile") or body

            if not isinstance(profile, dict):
                profile = {}
            print("PROFILE FINAL:", profile)
            
            company_name = (profile.get("companyName") or "Tu negocio").strip()
            industry = (profile.get("industry") or "").strip()
            sub_industry = (profile.get("subIndustry") or "").strip()
            city = (profile.get("city") or "").strip()
            country = (profile.get("country") or "").strip()
            slogan = (profile.get("slogan") or "").strip()
            tone = (profile.get("brandTone") or "cercano").strip()
            audience = (profile.get("audience") or "").strip()
            description = (profile.get("businessDescription") or "").strip()

            business_type = sub_industry or industry or "productos y servicios"
            location = city or country or "tu zona"

            api_key = os.getenv("OPENAI_API_KEY")
        
            # -----------------------------
            # 🛟 FALLBACK (NO ROMPE NADA)
            # -----------------------------
            def fallback():
                return {
                    "caption": (
                        f"¿Buscas {business_type} que realmente se ajuste a tu estilo? ✨\n\n"
                        f"En {company_name}, te ayudamos a encontrar opciones pensadas para ti en {location}. "
                        f"Descubre propuestas con calidad, confianza y ese toque especial que hace la diferencia.\n\n"
                        f"Escríbenos hoy y encuentra tu favorito."
                    ),
                    "hashtags": f"#{company_name.replace(' ', '')} #{business_type.replace(' ', '').replace(',', '')} #NegocioLocal #HazPost",
                    "visualIdea": (
                        f"Una imagen comercial y atractiva de {business_type}, mostrando una experiencia cercana, "
                        f"con estilo profesional y ambiente de confianza."
                    ),
                    "visualPlan": {
                        "format": "single_image",
                        "prompt": (
                            f"Professional realistic social media image for {company_name}, a {business_type} business "
                            f"in {location}. Warm lighting, premium commercial style, happy customer experience, "
                            f"clean composition, high quality, no text overlay."
                        ),
                        "slides": []
                    },
                    "source": "fallback"
                }

            result = None

            # -----------------------------
            # 🧠 IA REAL O FALLBACK SEGURO
            # -----------------------------
            if not api_key or not api_key.strip().startswith("sk-"):
                result = fallback()
            else:
                try:
                    client = OpenAI(api_key=api_key)

                    # 🔥 INSTRUCCIÓN SEGÚN TIPO DE POST
                    extra_instruction = ""

                    if post_type == "reel":
                        extra_instruction = "El contenido debe ser tipo REEL: corto, dinámico, con gancho fuerte en la primera línea y ritmo rápido."
                    elif post_type == "carousel":
                        extra_instruction = "El contenido debe estructurarse como CARRUSEL: varias ideas o pasos que generen curiosidad y hagan deslizar."
                    elif post_type == "story":
                        extra_instruction = "El contenido debe ser tipo HISTORIA: muy corto, directo y emocional."
                    elif post_type == "image":
                        extra_instruction = "El contenido debe ser para una sola imagen: claro, directo y visual."
                    else:
                        extra_instruction = "Elige el mejor formato automáticamente según el negocio."

                    sub_industries_raw = profile.get("subIndustries") or []

                    if isinstance(sub_industries_raw, list):
                        sub_industries_text = ", ".join([str(x) for x in sub_industries_raw if x])
                    else:
                        sub_industries_text = str(sub_industries_raw or "")

                    # 🔥 SELECCIÓN INTELIGENTE DE ENFOQUE (CRÍTICO)
                    import random

                    if isinstance(sub_industries_raw, list) and sub_industries_raw:
                        selected_focus = random.choice(sub_industries_raw)
                    else:
                        selected_focus = sub_industry or industry or "servicio general"
    
                    prompt = f"""
Eres un experto en marketing digital y copywriting.

Tu objetivo es VENDER, no solo describir.

Crea un post para redes sociales que:
- Tenga un gancho fuerte en la primera línea
- Genere deseo
- Sea emocional y cercano
- Incluya un llamado a la acción claro

Formato solicitado: {post_type}
Instrucción especial: {extra_instruction}

Reglas:
- NO uses frases genéricas
- USA el tipo de negocio real
- Usa la industria, sub-industria, descripción, audiencia, tono, ubicación y slogan para decidir el contenido
- Si el negocio tiene una descripción clara, priorízala sobre ideas genéricas
- Nunca inventes un tipo de negocio diferente
- Máximo 120 palabras
- Usa emojis estratégicamente
- Si hay website o referencias visuales, úsalas para entender mejor el negocio y su estilo
REGLA CRÍTICA DE ESCENARIO:

NO asumir que el negocio es residencial.

El negocio puede operar en múltiples contextos:
- residencial
- comercial
- industrial
- agrícola
- técnico
- mantenimiento
- instalación en empresas

Debes analizar TODA la información:
- subIndustries
- description
- audience
- contexto del negocio

Y elegir el escenario MÁS representativo del servicio real.

REGLA DE VARIACIÓN OBLIGATORIA:

Para ESTE post, el visualPlan debe usar el enfoque visual obligatorio indicado en Datos.

Si el enfoque visual obligatorio es residencial, hogar o familia pueden aparecer.

Si el enfoque visual obligatorio NO es residencial, no usar hogar, casa o familia como escena principal.

Residencial sigue siendo válido para otros posts, pero no debe dominar todas las generaciones.

El escenario puede ser residencial, comercial, industrial, agrícola o técnico según el negocio.

Si el negocio tiene múltiples servicios o sub-industrias, NO repetir siempre el mismo tipo de escenario.

Debes variar entre:
- hogares
- empresas
- industria
- campo
- instalaciones técnicas
- mantenimiento o servicio

Residencial es válido, pero NO debe ser el escenario dominante.

Cada imagen debe representar una parte distinta del negocio o un contexto diferente donde el servicio ocurre.

Elegir siempre el escenario más coherente con el mensaje del post, no el más común.

Si el negocio tiene múltiples servicios, alternar o elegir el más relevante.
REGLA ANTI-REPETICIÓN:
Si ya existe una sub-industria principal, NO la uses como único enfoque.
Para este post, elige una escena basada en cualquiera de las sub-industrias disponibles o en la descripción completa del negocio.
El resultado visual NO debe depender solo de la sub-industria principal.

Devuelve SOLO JSON válido:

{{
  "caption": "...",
  "hashtags": ["#tag1", "#tag2", "#tag3"],
  "visualIdea": "Describe brevemente una idea visual alineada al negocio real",
  "visualPlan": {{
    "format": "single_image",
    "prompt": "Genera una descripción de imagen para IA que represente EXACTAMENTE el negocio.

OBLIGATORIO:
- La imagen DEBE mostrar el producto o servicio principal del negocio según su industria, sub-industria y descripción
- Si no aparece el servicio real del negocio, la respuesta es incorrecta

Reglas estrictas:
- PROHIBIDO generar escenas genéricas (salas, decoración, paisajes sin relación)
- PROHIBIDO ignorar el tipo de negocio
- PROHIBIDO crear imágenes abstractas o sin contexto comercial
- DEBE ser una escena real del negocio (trabajo, instalación, uso del producto, cliente, servicio en acción)

Debe incluir:
- Producto o servicio real
- Contexto real del negocio
- Personas, objetos o escena relacionados directamente con el negocio
- Emoción alineada al negocio
- Estilo fotografía profesional tipo anuncio para redes sociales
- Alta calidad, realista, iluminación natural o comercial, composición limpia

REGLA DE CONTEXTO COMERCIAL:

La imagen NO debe enfocarse solo en el detalle técnico.

Debe mostrar el tipo de cliente o negocio donde ocurre el servicio.

Ejemplos:
- Restaurante → mostrar el local completo + paneles
- Bodega → techo industrial visible
- Fábrica → entorno industrial
- Campo → cultivo + instalación solar
- Oficina → edificio o espacio de trabajo
- Hogar → solo si el enfoque es residencial

La imagen debe permitir identificar claramente el tipo de negocio o entorno, no solo el panel o la instalación.

IMPORTANTE:
- NO generar escenas genéricas
- NO inventar un negocio diferente
- NO usar elementos que no correspondan al sector
- NO incluir texto, logos falsos ni marcas inventadas dentro de la imagen
- DEBE parecer una fotografía real usada por una empresa real

Instrucción final:
Escribe el prompt final completamente listo para generar una imagen.

- NO uses corchetes ni placeholders
- NO dejes partes incompletas
- DEBE estar totalmente adaptado al negocio recibido
- DEBE incluir el producto o servicio real del negocio
- DEBE incluir un contexto real donde ese servicio ocurre
- DEBE incluir emoción alineada al negocio
- Debe parecer una fotografía profesional usada en redes sociales

El resultado debe ser una sola descripción completa, específica y lista para usar en generación de imagen."
  }}
}}

Datos:
Empresa: {company_name}
Industria: {industry}
Sub-industrias disponibles: {sub_industries_text}
Enfoque visual obligatorio para ESTE post: {selected_focus}
Tipo negocio: {business_type}
Ubicación: {location}
Tono: {tone}
Audiencia: {audience}
Descripción: {description}
Slogan: {slogan}

Contexto adicional del negocio (usar si está disponible):
Website: {profile.get("website")}
Colores de marca: {profile.get("primaryColor")}
Imágenes de referencia: {profile.get("referenceImages")}

IMPORTANTE:
El negocio puede operar en múltiples contextos (residencial, comercial, industrial, agrícola, técnico).
NO asumir un solo tipo de escenario. Usar TODA la información para decidir.

Extra:
- Usa beneficios reales del negocio
- Puedes incluir urgencia si aplica
- Evita sonar robótico
"""

                    response = client.responses.create(
                        model="gpt-4o-mini",
                        input=prompt,
                        temperature=0.8
                    )

                    text = response.output_text.strip()
                    print("OPENAI RAW:", text)

                    try:
                        clean_text = text.strip()

                        if clean_text.startswith("```"):
                            clean_text = clean_text.replace("```json", "").replace("```", "").strip()

                        json_start = clean_text.find("{")
                        json_end = clean_text.rfind("}")

                        if json_start != -1 and json_end != -1:
                            clean_text = clean_text[json_start:json_end + 1]

                        result = json.loads(clean_text)
                        result["source"] = "openai"

                        visual_prompt = ((result.get("visualPlan") or {}).get("prompt") or "").lower()

                        bad_prompt = (
                            not visual_prompt
                            or len(visual_prompt) < 50
                            or "[" in visual_prompt
                            or "]" in visual_prompt
                        )
                        if bad_prompt:
                            result["visualPlan"] = {
                                "format": "single_image",
                                "prompt": (
                                    f"Imagen publicitaria realista para {company_name}, negocio de {industry or business_type} en {location}. "
                                    f"Debe mostrar claramente uno de los servicios reales del negocio según esta información: {description or sub_industries_text or business_type}. "
                                    f"Escena real del servicio en acción, usando un contexto coherente con el perfil completo: residencial, comercial, industrial, agrícola, técnico o mantenimiento según corresponda. "
                                    f"No usar siempre casa o familia por defecto. Fotografía profesional para redes sociales, alta calidad, luz natural, composición limpia, sin texto ni logos falsos."
                                )
                            }

                        # 🔥 AJUSTAR FORMATO SEGÚN post_type
                        if "visualPlan" not in result:
                            result["visualPlan"] = {}

                        if post_type == "reel":
                            result["visualPlan"]["format"] = "reel"

                        elif post_type == "carousel":
                            result["visualPlan"]["format"] = "carousel"

                            # 🔥 BONUS: crear slides si no vienen
                            if "slides" not in result["visualPlan"]:
                                result["visualPlan"]["slides"] = [
                                    {"text": "Slide 1"},
                                    {"text": "Slide 2"},
                                    {"text": "Slide 3"}
                                ]

                        elif post_type == "story":
                            result["visualPlan"]["format"] = "story"

                        elif post_type == "image":
                            result["visualPlan"]["format"] = "single_image"

                    except Exception as parse_error:
                        logger.warning(f"⚠️ JSON inválido, usando fallback: {parse_error}")
                        result = fallback()

                except Exception as openai_error:
                    logger.warning(f"⚠️ OpenAI falló, usando fallback: {openai_error}")
                    result = fallback()

            hashtags = result.get("hashtags", [])
            if isinstance(hashtags, list):
                hashtags = " ".join(hashtags)

            result["hashtags"] = hashtags

            # ============================================================
            # 🔥 APPLY TEXT BLOCKS (BLOQUES COMERCIALES)
            # ============================================================
            try:
                user = session.get("user") or {}
                user_id = str(
                    user.get("email")
                    or user.get("id")
                    or session.get("user_id")
                    or session.get("userId")
                    or "demo"
                )

                blocks = get_text_blocks(user_id)
                caption = result.get("caption") or ""

                # 🔹 Normalizar texto para búsqueda
                caption_lower = caption.lower()

                selected_blocks = []

                for block in blocks:
                    block = block.get("data") or block
                    if not block.get("active", True):
                        continue

                    keywords = block.get("keywords") or []

                    # Si no tiene keywords → aplica a todos
                    if not keywords:
                        selected_blocks.append(block)
                        continue

                    # Si tiene keywords → buscar match
                    for kw in keywords:
                        kw_text = str(kw or "").strip().lower()
                        if kw_text and kw_text in caption_lower:
                            selected_blocks.append(block)
                            break
                            
                # 🔥 Limitar a máximo 2 bloques (evitar spam)
                selected_blocks = selected_blocks[:2]

                # 🔥 Aplicar bloques
                for block in selected_blocks:
                    content = (block.get("content") or "").strip()

                    if not content:
                        continue

                    if block.get("position") == "before":
                        caption = content + "\n\n" + caption
                    else:
                        caption = caption + "\n\n" + content

                result["caption"] = caption
                
            except Exception as e:
                logger.warning(f"TEXT BLOCK APPLY ERROR: {e}")

            # ============================================================
            # 💾 GUARDAR EN DB (POSTGRESQL)
            # ============================================================
            user = session.get("user") or {}
            user_id = str(
                user.get("email")
                or user.get("id")
                or session.get("user_id")
                or session.get("userId")
                or "demo"
            )

            new_post = {
                "businessId": "1",
                "caption": result.get("caption"),
                "hashtags": result.get("hashtags"),
                "visualIdea": result.get("visualIdea"),
                "visualPlan": result.get("visualPlan"),
                "tone": tone,
                "source": result.get("source"),

                # 🔥 CLAVE: plataformas desde el inicio
                "platform": "both",  # IG + TK por defecto

                # 🔥 CLAVE: estructura preparada para calendar
                "scheduledAt": None,
                "scheduledAtInstagram": None,
                "scheduledAtTiktok": None,
                "scheduledAtFacebook": None,

                # 🔥 tracking futuro
                "instagramPostId": None,
                "tiktokPostId": None,
                "facebookPostId": None,

                "status": "pending_approval",
                "companyName": company_name,
                "industry": industry,
                "subIndustry": sub_industry,
                "businessType": business_type,
                "location": location,
            }

            # 🔥 ESTO TE FALTABA
            saved_post = save_post(
                user_id=user_id,
                post=new_post,
                business_id="1",
                status="pending_approval"
            )

            return jsonify({
                "success": True,
                "caption": result.get("caption"),
                "hashtags": result.get("hashtags"),
                "visualIdea": result.get("visualIdea"),
                "visualPlan": result.get("visualPlan"),
                "tone": tone,
                "source": result.get("source"),
                "status": "pending_approval",
                "postId": saved_post.get("id"),
                "post": saved_post,
            })

        except Exception as e:
            logger.exception(f"GENERATE FIRST POST ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error generando primer post"
            }), 500


    # ============================================================
    # BLUEPRINTS FINALES (CRÍTICO PARA DASHBOARD)
    # ============================================================
    app.register_blueprint(oauth_meta_bp)
    app.register_blueprint(image_generation_bp, url_prefix='/api')
    app.register_blueprint(dashboard_bp, url_prefix='/api')

    
    # ============================================================
    # TEXT BLOCKS — Bloques comerciales del usuario
    # ============================================================
    @app.route('/api/text-blocks', methods=['GET', 'POST'])
    @app.route('/api/caption-addons', methods=['GET', 'POST'])
    def text_blocks():
        try:
            user = session.get("user") or {}
            user_id = str(
                user.get("email")
                or session.get("user_id")
                or session.get("userId")
                or user.get("id")
                or "demo"
            )
                        
            if request.method == 'GET':
                blocks = get_text_blocks(user_id)

                if request.path.endswith("/caption-addons"):
                    return jsonify({
                        "success": True,
                        "items": blocks,
                        "data": blocks,
                        "addons": blocks
                    })

                return jsonify({
                    "success": True,
                    "items": blocks
                })

            data = request.get_json(silent=True) or {}

            name = (data.get("name") or "").strip()
            content = (
                data.get("content")
                or data.get("text")
                or data.get("caption")
                or ""
            ).strip()

            if not name or not content:
                return jsonify({
                    "success": False,
                    "error": "Nombre y contenido son requeridos"
                }), 400

            keywords = data.get("keywords") or []
            if isinstance(keywords, str):
                keywords = [k.strip() for k in keywords.split(",") if k.strip()]

            new_block = {
                "id": str(uuid.uuid4()),
                "name": name,
                "keywords": keywords,
                "content": content,
                "position": data.get("position") or "after",
                "active": data.get("active", True),
            }

            save_text_block(user_id, new_block)
            blocks = get_text_blocks(user_id)
            normalized_blocks = [
                b.get("data") if isinstance(b, dict) and "data" in b else b
                for b in blocks
            ]

            return jsonify({
                "success": True,
                "item": new_block,
                "items": normalized_blocks,
                "data": normalized_blocks,
                "addons": normalized_blocks
            }), 201
        except Exception as e:
            logger.exception(f"TEXT BLOCKS ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error interno"
            }), 500


    @app.route('/api/text-blocks/<block_id>', methods=['PUT', 'DELETE'])
    @app.route('/api/caption-addons/<block_id>', methods=['PUT', 'DELETE'])
    def text_block_detail(block_id):
        try:
            user = session.get("user") or {}
            user_id = str(
                user.get("email")
                or session.get("user_id")
                or session.get("userId")
                or user.get("id")
                or "demo"
            )
            blocks = get_text_blocks(user_id)
            normalized_blocks = []

            for block in blocks:
                normalized_blocks.append(block.get("data") or block)

            index = next(
                (i for i, b in enumerate(normalized_blocks) if b.get("id") == block_id),
                None
            )

            if index is None:
                return jsonify({
                    "success": False,
                    "error": "Bloque no encontrado"
                }), 404

            if request.method == 'DELETE':
                deleted = normalized_blocks[index]
                deleted["active"] = False

                save_text_block(user_id, deleted)
                updated_blocks = get_text_blocks(user_id)

                return jsonify({
                    "success": True,
                    "item": deleted,
                    "items": updated_blocks
                })

            data = request.get_json(silent=True) or {}

            keywords = data.get("keywords")
            if keywords is None:
                keywords = normalized_blocks[index].get("keywords", [])
            elif isinstance(keywords, str):
                keywords = [k.strip() for k in keywords.split(",") if k.strip()]

            updated = {
                **normalized_blocks[index],
                "name": (data.get("name") or "").strip() or normalized_blocks[index].get("name", ""),
                "content": (data.get("content") or "").strip() or normalized_blocks[index].get("content", ""),
                "keywords": keywords,
                "position": data.get("position") or normalized_blocks[index].get("position", "after"),
                "active": data.get("active", normalized_blocks[index].get("active", True)),
            }

            save_text_block(user_id, updated)
            updated_blocks = get_text_blocks(user_id)
            updated_blocks = [
                b.get("data") if isinstance(b, dict) and "data" in b else b
                for b in updated_blocks
            ]
            
            return jsonify({
                "success": True,
                "item": updated,
                "items": updated_blocks
            })

        except Exception as e:
            logger.exception(f"TEXT BLOCK DETAIL ERROR: {e}")
            return jsonify({
                "success": False,
                "error": "Error interno"
            }), 500
            
     
    # ============================================================
    # FALLBACK API — evita 405 en endpoints no implementados
    # ============================================================
    @app.route('/api/<path:unknown_path>', methods=['GET'])
    def api_fallback_get(unknown_path):
        logger.warning(f"[FALLBACK GET] Endpoint no implementado: /api/{unknown_path}")
        return jsonify({
            "error": "Endpoint no existe",
            "path": unknown_path
        }), 404
    
    @app.route('/api/<path:unknown_path>', methods=['POST', 'PUT', 'PATCH', 'DELETE'])
    def api_fallback_mutation(unknown_path):
        logger.warning(f"[FALLBACK MUTATION] Endpoint no implementado: /api/{unknown_path}")
        return jsonify({
            "success": True,
            "message": f"Endpoint /api/{unknown_path} recibido en modo fallback"
        }), 200
        
       
    # ============================================================
    # RETURN APP (FIN create_app)
    # ============================================================
    return app


# ============================================================
# APP GLOBAL PARA GUNICORN
# ============================================================
app = create_app()


# ============================================================
# RUN LOCAL (SOLO DEV)
# ============================================================
if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port)

