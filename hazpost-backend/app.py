import os
import fcntl
import logging
from flask import Flask, render_template
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

    if not app.config['API_KEY'] and not app.config['DEBUG']:
        logger.warning(
            'API_KEY is not set — all write endpoints (POST/DELETE) are UNPROTECTED. '
            'Set API_KEY in .env before deploying to production.'
        )

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

    data_dir = app.config['DATA_DIR']
    lock_file = _try_acquire_scheduler_lock(data_dir)
    if lock_file is not None:
        _SCHEDULER_LOCK_FILE = lock_file
        logger.info('Acquired scheduler lock — starting background scheduler for this worker')

        scan_hours = app.config['SCAN_INTERVAL_HOURS']
        monitor_minutes = app.config['MONITOR_INTERVAL_MINUTES']
        backup_hour = app.config['BACKUP_HOUR_UTC']

        scheduler = BackgroundScheduler()
        scheduler.add_job(
            func=lambda: run_full_scan(
                app.config['TARGET_SITE'],
                app.config['TELEGRAM_BOT_TOKEN'],
                app.config['TELEGRAM_CHAT_ID']
            ),
            trigger='interval',
            hours=scan_hours,
            id='full_scan',
            replace_existing=True
        )
        scheduler.add_job(
            func=lambda: check_site_status(
                app.config['TARGET_SITE'],
                app.config['TELEGRAM_BOT_TOKEN'],
                app.config['TELEGRAM_CHAT_ID']
            ),
            trigger='interval',
            minutes=monitor_minutes,
            id='site_monitor',
            replace_existing=True
        )
        scheduler.add_job(
            func=lambda: run_backup(
                retention_days=app.config['BACKUP_RETENTION_DAYS'],
                bot_token=app.config['TELEGRAM_BOT_TOKEN'],
                chat_id=app.config['TELEGRAM_CHAT_ID']
            ),
            trigger='cron',
            hour=backup_hour,
            minute=0,
            id='daily_backup',
            replace_existing=True
        )
        scheduler.add_job(
            func=run_github_backup,
            trigger='interval',
            hours=6,
            id='github_backup',
            replace_existing=True
        )
        scheduler.add_job(
            func=lambda: run_image_scan(
                app.config['TELEGRAM_BOT_TOKEN'],
                app.config['TELEGRAM_CHAT_ID'],
                app.config['DATA_DIR'],
            ),
            trigger='interval',
            hours=24,
            id='image_scan',
            replace_existing=True
        )
        scheduler.add_job(
            func=lambda: check_and_update(
                app.config['TELEGRAM_BOT_TOKEN'],
                app.config['TELEGRAM_CHAT_ID'],
            ),
            trigger='interval',
            hours=6,
            id='auto_actualizacion',
            replace_existing=True
        )
        scheduler.start()
        logger.info(
            f'Scheduler started: scan every {scan_hours}h, '
            f'monitor every {monitor_minutes}min, '
            f'backup at {backup_hour:02d}:00 UTC, '
            f'github backup every 6h, '
            f'image scan every 24h, '
            f'auto-update every 6h'
        )

        import threading
        threading.Thread(
            target=lambda: check_and_update(
                app.config['TELEGRAM_BOT_TOKEN'],
                app.config['TELEGRAM_CHAT_ID'],
            ),
            daemon=True,
            name='startup-auto-update',
        ).start()
    else:
        logger.info('Scheduler lock already held by another worker — skipping scheduler init')

    @app.route('/')
    def index():
        return {
            'service': 'HazPost Backend',
            'version': '1.0.0',
            'status': 'running',
            'endpoints': [
                '/api/monitor',
                '/api/scanner',
                '/api/backup',
                '/api/duplicados',
                '/api/aislamiento',
                '/api/aprendizaje',
                '/sitemap.xml',
                '/robots.txt',
                '/skills'
            ]
        }

    @app.route('/health')
    def health():
        return {'status': 'ok'}

    @app.route('/skills')
    def skills_view():
        from src.scanner import _load_results, _load_skills
        from src.duplicados import find_duplicates

        results = _load_results()
        scan_info = results[-1] if results else None
        skills = _load_skills()
        duplicates = find_duplicates(skills)

        categories = sorted({s.get('category') for s in skills if s.get('category')})
        pages_with_skills = len({s.get('page_url') for s in skills if s.get('page_url')})

        return render_template(
            'skills.html',
            skills=skills,
            scan_info=scan_info,
            duplicate_count=len(duplicates),
            categories=categories,
            pages_with_skills=pages_with_skills
        )

    return app


if __name__ == '__main__':
    app = create_app()
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
