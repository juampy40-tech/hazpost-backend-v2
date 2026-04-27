import os
import fcntl
import logging
from flask import Flask, render_template, request, make_response, jsonify, session
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler

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

_SCHEDULER_LOCK_FILE = None


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


def create_app():
    global _SCHEDULER_LOCK_FILE

    app = Flask(__name__)

    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

    # ============================================================
    # 🍪 COOKIES / SESIÓN — FIX CRÍTICO PARA VERCEL + RAILWAY
    # ============================================================
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'None'   # 🔥 obligatorio cross-domain
    app.config['SESSION_COOKIE_SECURE'] = True       # 🔥 obligatorio HTTPS
    app.config['SESSION_COOKIE_DOMAIN'] = None       # 🔥 evita conflictos de dominio

    # 🔥 Persistencia de sesión
    app.config['SESSION_PERMANENT'] = True
    app.config['PERMANENT_SESSION_LIFETIME'] = 60 * 60 * 24 * 7  # 7 días

    app.config['DEBUG'] = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    app.config['TARGET_SITE'] = os.getenv('TARGET_SITE', 'https://hazpost.app')
    app.config['TELEGRAM_BOT_TOKEN'] = os.getenv('TELEGRAM_BOT_TOKEN', '')
    app.config['TELEGRAM_CHAT_ID'] = os.getenv('TELEGRAM_CHAT_ID', '')
    app.config['BACKUP_RETENTION_DAYS'] = int(os.getenv('BACKUP_RETENTION_DAYS', '30'))
    app.config['DATA_DIR'] = os.getenv('DATA_DIR', os.path.join(os.path.dirname(__file__), 'data'))
    app.config['SCAN_INTERVAL_HOURS'] = int(os.getenv('SCAN_INTERVAL_HOURS', '6'))
    app.config['MONITOR_INTERVAL_MINUTES'] = int(os.getenv('MONITOR_INTERVAL_MINUTES', '5'))
    app.config['BACKUP_HOUR_UTC'] = int(os.getenv('BACKUP_HOUR_UTC', '2'))
    app.config['API_KEY'] = os.getenv('API_KEY', '')

    # CORS primero para que incluso errores, OPTIONS y respuestas bloqueadas lleven headers correctos.
    _apply_cors(app)

    # Seguridad después, manteniendo rate limit, headers, bloqueo de IP y API key.
    init_security(app)

    app.register_blueprint(seo_bp)
    app.register_blueprint(security_bp, url_prefix='/api/security')
    app.register_blueprint(monitor_bp, url_prefix='/api/monitor')
    app.register_blueprint(scanner_bp, url_prefix='/api/scanner')
    app.register_blueprint(backup_bp, url_prefix='/api/backup')
    app.register_blueprint(imagenes_bp, url_prefix='/api/imagenes')
    app.register_blueprint(duplicados_bp, url_prefix='/api/duplicados')
    app.register_blueprint(aislamiento_bp, url_prefix='/api/aislamiento')
    app.register_blueprint(aprendizaje_bp, url_prefix='/api/aprendizaje')
    app.register_blueprint(dashboard_bp, url_prefix='/api')


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
                "credits": 50,
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
                return jsonify({"error": "Email y contraseña requeridos"}), 400

            user = {
                "id": 1,
                "email": email,
                "displayName": email.split("@")[0],
                "role": "user",
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

            return jsonify({
                "success": True,
                "user": user,
                "subscription": subscription,
            })

        except Exception as e:
            logger.exception(f"LOGIN ERROR: {e}")
            return jsonify({"error": "Error interno"}), 500


    # ============================================================
    # USER ME
    # ============================================================
    @app.route('/api/user/me', methods=['GET'])
    def user_me():
        user = session.get("user")
        if not user:
            return jsonify({"error": "Not authenticated"}), 401

        return jsonify({
            "user": user,
            "subscription": session.get("subscription"),
        })


    # ============================================================
    # LOGOUT
    # ============================================================
    @app.route('/api/user/logout', methods=['POST'])
    def user_logout():
        session.clear()
        return jsonify({"success": True})


    # ============================================================
    # USER BOOTSTRAP — Compatibilidad frontend
    # ============================================================
    @app.route('/api/user/bootstrap', methods=['GET'])
    def user_bootstrap():
        return jsonify({"hasUsers": True})

    
    # ============================================================
    # REGISTER USER — Registro desde frontend
    # ============================================================
    @app.route('/api/user/register', methods=['POST'])
    def register_user():
        try:
            data = request.get_json(silent=True) or {}

            email = data.get("email")
            password = data.get("password")
            display_name = data.get("displayName") or data.get("name") or ""
            affiliate_code = data.get("affiliateCode")
            referral_code = data.get("referralCode")
            selected_plan = data.get("selectedPlan")
            logo_url = data.get("logoUrl")
            primary_color = data.get("primaryColor")

            if not email or not password:
                return jsonify({"error": "Email y contraseña requeridos"}), 400

            # NOTA:
            # Este endpoint mantiene el flujo vivo mientras se conecta el módulo real
            # de usuarios/base de datos. No elimina ninguna lógica existente del backend.
            user = {
                "id": 1,
                "email": email,
                "displayName": display_name,
                "role": "user",
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

            session["user"] = user
            session["subscription"] = subscription
            session.permanent = True

            response = jsonify({
                "success": True,
                "user": user,
                "subscription": subscription,
                "pendingPlan": selected_plan if selected_plan and selected_plan != "free" else None,
                "affiliateCode": affiliate_code,
                "referralCode": referral_code,
                "logoUrl": logo_url,
                "primaryColor": primary_color,
            })

            return response, 201

        except Exception as e:
            logger.exception(f"REGISTER ERROR: {e}")
            return jsonify({"error": "Error interno"}), 500


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
            return jsonify({"error": "Error interno"}), 500

    # ============================================================
    # INDUSTRY SUGGESTIONS — Guardar nuevas industrias
    # ============================================================
    @app.route('/api/industries/suggestions', methods=['POST'])
    def save_industry_suggestion_api():
        try:
            data = request.get_json(silent=True) or {}
            name = data.get("name")

            if not name or not name.strip():
                return jsonify({"error": "Nombre requerido"}), 400

            from src.catalogs.industry_suggestions import save_industry_suggestion

            result = save_industry_suggestion(name)

            return jsonify({
                "success": True,
                "result": result
            })

        except Exception as e:
            logger.exception(f"SUGGESTION ERROR: {e}")
            return jsonify({"error": "Error interno"}), 500
            

    # ============================================================
    # BRAND PROFILE — Guardado progreso onboarding
    # ============================================================
    @app.route('/api/brand-profile', methods=['GET', 'PUT', 'POST'])
    def brand_profile():
        try:
            if request.method == 'GET':
                return jsonify({"brandProfile": session.get("brandProfile", {})})

            data = request.get_json(silent=True) or {}

            profile = {
                "id": 1,
                **session.get("brandProfile", {}),
                **data,
            }

            session["brandProfile"] = profile
            session.permanent = True

            return jsonify({
                "success": True,
                "brandProfile": profile,
            })

        except Exception as e:
            logger.exception(f"BRAND PROFILE ERROR: {e}")
            return jsonify({"error": "Error interno"}), 500

    
    # ============================================================
    # BUSINESSES — Guardado inicial del negocio
    # ============================================================
    @app.route('/api/businesses', methods=['GET', 'POST'])
    def businesses():
        try:
            if request.method == 'GET':
                return jsonify({"businesses": session.get("businesses", [])})

            data = request.get_json(silent=True) or {}
            businesses_list = session.get("businesses", [])

            business = {
                "id": len(businesses_list) + 1,
                **data,
            }

            businesses_list.append(business)
            session["businesses"] = businesses_list
            session.permanent = True

            return jsonify({
                "success": True,
                "business": business,
            }), 201

        except Exception as e:
            logger.exception(f"BUSINESSES ERROR: {e}")
            return jsonify({"error": "Error interno"}), 500


    # ============================================================
    # BUSINESS DETAIL — Editar / leer / borrar negocio por ID
    # ============================================================
    @app.route('/api/businesses/<int:business_id>', methods=['GET', 'PUT', 'PATCH', 'DELETE'])
    def business_detail(business_id):
        try:
            businesses_list = session.get("businesses", [])
            if not isinstance(businesses_list, list):
                businesses_list = []

            index = next(
                (i for i, business in enumerate(businesses_list)
                 if int(business.get("id", 0)) == business_id),
                None
            )

            if index is None:
                return jsonify({"error": "Negocio no encontrado"}), 404

            if request.method == 'GET':
                return jsonify({"business": businesses_list[index]})

            if request.method == 'DELETE':
                deleted = businesses_list.pop(index)
                session["businesses"] = businesses_list
                session.permanent = True
                return jsonify({"success": True, "business": deleted})

            data = request.get_json(silent=True) or {}

            updated_business = {
                **businesses_list[index],
                **data,
                "id": business_id,
            }

            businesses_list[index] = updated_business
            session["businesses"] = businesses_list
            session.permanent = True

            return jsonify({
                "success": True,
                "business": updated_business,
            })

        except Exception as e:
            logger.exception(f"BUSINESS DETAIL ERROR: {e}")
            return jsonify({"error": "Error interno"}), 500


    @app.route('/')
    def index():
        return {"status": "ok"}


    @app.route('/health')
    def health():
        return {"status": "ok"}


    # Catch-all OPTIONS para que cualquier endpoint nuevo del backend responda preflight.
    @app.route('/api/<path:_path>', methods=['OPTIONS'])
    def api_options(_path):
        response = make_response("", 204)
        return _attach_cors_headers(response)


    # ============================================================
    # SETTINGS / AUTOMATION STUBS — Evita errores de UI
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
    # ANALYTICS / IA SUGERENCIAS — requerido por frontend
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
            "email": "admin@hazpost.com",
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
        return user_admin_users()


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
# ============================================================

import uuid
from werkzeug.utils import secure_filename
from flask import send_from_directory

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

        upload_dir = os.path.join(os.path.dirname(__file__), 'uploads')
        os.makedirs(upload_dir, exist_ok=True)

        object_path = f"/storage/objects/uploads/{stored_name}"

        # 🔥 FIX HTTPS (CLAVE)
        base_url = request.host_url.rstrip('/').replace('http://', 'https://')

        public_url = f"{base_url}/api{object_path}"
        upload_url = f"{base_url}/api/storage/uploads/direct?filename={stored_name}"

        return jsonify({
            "success": True,
            "uploadURL": upload_url,
            "uploadUrl": upload_url,
            "upload_url": upload_url,
            "signedUrl": upload_url,
            "url": upload_url,
            "objectPath": object_path,
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


@app.route('/api/storage/uploads/direct', methods=['POST'])
def storage_upload_direct():
    try:
        filename = request.args.get("filename") or f"{uuid.uuid4()}_upload.bin"
        safe_name = secure_filename(filename) or f"{uuid.uuid4()}_upload.bin"

        upload_dir = os.path.join(os.path.dirname(__file__), 'uploads')
        os.makedirs(upload_dir, exist_ok=True)

        filepath = os.path.join(upload_dir, safe_name)

        if 'file' not in request.files:
            return jsonify({
                "success": False,
                "error": "Archivo requerido"
            }), 400

        uploaded_file = request.files['file']
        uploaded_file.save(filepath)

        object_path = f"/storage/objects/uploads/{safe_name}"

        # 🔥 FIX HTTPS
        base_url = request.host_url.rstrip('/').replace('http://', 'https://')
        public_url = f"{base_url}/api{object_path}"

        return jsonify({
            "success": True,
            "url": public_url,
            "publicUrl": public_url,
            "objectPath": object_path,
            "filename": safe_name,
        })

    except Exception as e:
        logger.exception(f"STORAGE DIRECT UPLOAD ERROR: {e}")
        return jsonify({
            "success": False,
            "error": "Error subiendo archivo"
        }), 500


@app.route('/api/storage/objects/uploads/<path:filename>', methods=['GET'])
def storage_get_uploaded_object(filename):
    try:
        safe_name = secure_filename(filename)
        upload_dir = os.path.join(os.path.dirname(__file__), 'uploads')

        if not safe_name:
            return jsonify({"error": "Archivo inválido"}), 400

        return send_from_directory(upload_dir, safe_name)

    except Exception as e:
        logger.exception(f"STORAGE GET OBJECT ERROR: {e}")
        return jsonify({
            "success": False,
            "error": "Archivo no encontrado"
        }), 404


    # ============================================================
    # FALLBACK API — evita 405 en endpoints no implementados
    # ============================================================
    @app.route('/api/<path:unknown_path>', methods=['GET'])
    def api_fallback_get(unknown_path):
        logger.warning(f"[FALLBACK GET] Endpoint no implementado: /api/{unknown_path}")
        return jsonify([])


    @app.route('/api/<path:unknown_path>', methods=['POST', 'PUT', 'PATCH', 'DELETE'])
    def api_fallback_mutation(unknown_path):
        logger.warning(f"[FALLBACK MUTATION] Endpoint no implementado: /api/{unknown_path}")
        return jsonify({
            "success": True,
            "message": f"Endpoint /api/{unknown_path} recibido en modo fallback"
        }), 200


    return app


# 🔥 ESTA LÍNEA ES CLAVE PARA GUNICORN
app = create_app()


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
