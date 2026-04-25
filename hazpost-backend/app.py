import os
import fcntl
import logging
from flask import Flask, render_template, request, make_response
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

_SCHEDULER_LOCK_FILE = None


def _try_acquire_scheduler_lock(data_dir: str):
    lock_path = os.path.join(data_dir, '.scheduler.lock')
    os.makedirs(data_dir, exist_ok=True)
    try:
        lock_file = open(lock_path, 'w')
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return lock_file
    except (IOError, OSError):
        return None


def _get_allowed_origins():
    default_origins = [
        "https://hazpost.app",
        "https://www.hazpost.app",
        "https://hazpost-frontend.vercel.app",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]

    env_origins = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGIN", "").split(",")
        if origin.strip()
    ]

    return list(dict.fromkeys(default_origins + env_origins))


def _apply_cors(app: Flask):
    allowed_origins = _get_allowed_origins()

    @app.before_request
    def handle_cors_preflight():
        if request.method != "OPTIONS":
            return None

        response = make_response("", 204)
        origin = request.headers.get("Origin")

        if origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Vary"] = "Origin"

        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = (
            request.headers.get("Access-Control-Request-Headers")
            or "Content-Type, Authorization, X-Requested-With"
        )
        response.headers["Access-Control-Max-Age"] = "86400"

        return response

    @app.after_request
    def add_cors_headers(response):
        origin = request.headers.get("Origin")

        if origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Vary"] = "Origin"

        return response


def create_app():
    global _SCHEDULER_LOCK_FILE

    app = Flask(__name__)

    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
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

    init_security(app)
    _apply_cors(app)

    app.register_blueprint(seo_bp)
    app.register_blueprint(security_bp, url_prefix='/api/security')
    app.register_blueprint(monitor_bp, url_prefix='/api/monitor')
    app.register_blueprint(scanner_bp, url_prefix='/api/scanner')
    app.register_blueprint(backup_bp, url_prefix='/api/backup')
    app.register_blueprint(imagenes_bp, url_prefix='/api/imagenes')
    app.register_blueprint(duplicados_bp, url_prefix='/api/duplicados')
    app.register_blueprint(aislamiento_bp, url_prefix='/api/aislamiento')
    app.register_blueprint(aprendizaje_bp, url_prefix='/api/aprendizaje')

    @app.route('/')
    def index():
        return {"status": "ok"}

    @app.route('/health')
    def health():
        return {"status": "ok"}

    return app


# 🔥 ESTA LÍNEA ES CLAVE PARA GUNICORN
app = create_app()


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
