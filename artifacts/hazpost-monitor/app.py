import functools
import hmac
import json
import logging
import os
import sys
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from flask import (
    Flask, Response, jsonify, redirect, render_template,
    request, send_file, session, url_for,
)

load_dotenv()

Path("logs").mkdir(exist_ok=True)
Path("data").mkdir(exist_ok=True)
Path("backups").mkdir(exist_ok=True)

MODO = os.getenv("MODO", "produccion").lower()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/monitor.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

from src.aislamiento import (
    ensure_base_dirs as _ensure_usuarios_dirs,
    get_all_users_data,
    list_users,
    read_user_data,
    update_user_skills,
)
from src.alert_history import get_history as get_alert_history
from src.aprendizaje_colectivo import (
    ensure_base_dirs as _ensure_colectivo_dirs,
    get_conocimiento,
    get_resumen as get_resumen_colectivo,
    list_rubros,
    update_conocimiento,
)
from src.backup import list_backups, run_backup
from src.duplicados import get_fusion_history
from src.monitor import check_site, get_status
from src.scanner import scan_now
from src.security import apply_security_headers, init_limiter, record_login_attempt
from src.seo import generate_robots, generate_sitemap, get_meta_tags
from src.telegram_alerts import send_daily_summary, send_startup_alert

_ensure_usuarios_dirs()
_ensure_colectivo_dirs()

DATA_FILE = Path("data/skills_auto.json")

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "change-me-in-production")
app.config["JSON_AS_ASCII"] = False

limiter = init_limiter(app)

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
LOG_FILE = Path("logs/monitor.log")


def _admin_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("admin_logged_in"):
            return redirect(url_for("admin_login_get"))
        return f(*args, **kwargs)
    return decorated


def _check_password(candidate: str) -> bool:
    if not ADMIN_PASSWORD:
        return False
    return hmac.compare_digest(
        candidate.encode("utf-8"),
        ADMIN_PASSWORD.encode("utf-8"),
    )


def _read_log_tail(n: int = 50) -> list[str]:
    if not LOG_FILE.exists():
        return ["(archivo de log no encontrado)"]
    try:
        with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as f:
            tail = list(deque(f, maxlen=n))
        return [line.rstrip() for line in tail]
    except Exception as exc:
        return [f"Error leyendo log: {exc}"]


# ── ADMIN PANEL ──────────────────────────────────────────────────────────────

@app.route("/admin/login", methods=["GET"])
def admin_login_get():
    if session.get("admin_logged_in"):
        return redirect(url_for("admin_panel"))
    return render_template("admin_login.html", error=None)


@app.route("/admin/login", methods=["POST"])
@limiter.limit("10 per minute")
def admin_login_post():
    ip = request.remote_addr or "unknown"
    candidate = request.form.get("password", "")
    is_attack = record_login_attempt(ip, "/admin/login")
    if is_attack:
        return render_template("admin_login.html", error="Demasiados intentos. Inténtalo más tarde."), 429
    if not _check_password(candidate):
        logger.warning("Intento de login admin fallido desde %s", ip)
        return render_template("admin_login.html", error="Contraseña incorrecta."), 401
    session["admin_logged_in"] = True
    session.permanent = False
    logger.info("Login admin exitoso desde %s", ip)
    return redirect(url_for("admin_panel"))


@app.route("/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin_logged_in", None)
    return redirect(url_for("admin_login_get"))


@app.route("/admin")
@_admin_required
def admin_panel():
    data = _load_data()
    site_status = get_status()
    backups = list_backups()
    alerts = get_alert_history(50)
    return render_template(
        "admin.html",
        skills_count=len(data.get("skills", [])),
        scan_count=data.get("scan_count", 0),
        site_status=site_status,
        backups=backups,
        alerts=alerts,
        modo=MODO,
        now=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )


@app.route("/admin/backup/<filename>")
@_admin_required
def admin_download_backup(filename: str):
    safe_name = Path(filename).name
    if not safe_name.startswith("backup_") or not safe_name.endswith(".tar.gz"):
        return jsonify({"error": "Nombre de archivo no válido"}), 400
    backup_path = Path("backups") / safe_name
    if not backup_path.exists():
        return jsonify({"error": "Backup no encontrado"}), 404
    return send_file(
        backup_path.resolve(),
        as_attachment=True,
        download_name=safe_name,
        mimetype="application/gzip",
    )


@app.route("/admin/api/logs")
@_admin_required
def admin_api_logs():
    lines = _read_log_tail(50)
    return jsonify({"lines": lines, "count": len(lines)})


@app.route("/admin/api/scan", methods=["POST"])
@_admin_required
@limiter.limit("2 per minute")
def admin_api_scan():
    logger.info("Escaneo manual disparado desde panel admin")
    result = scan_now()
    return jsonify(result)


# ── RUTAS PÚBLICAS ───────────────────────────────────────────────────────────

def _load_data() -> dict:
    if DATA_FILE.exists():
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"skills": [], "last_scan": None, "fusion_history": [], "scan_count": 0}


@app.after_request
def add_security_headers(response):
    return apply_security_headers(response)


@app.route("/")
def index():
    data = _load_data()
    site_status = get_status()
    meta = get_meta_tags("home")
    backups = list_backups()
    return render_template(
        "index.html",
        meta=meta,
        skills_count=len(data.get("skills", [])),
        last_scan=data.get("last_scan"),
        scan_count=data.get("scan_count", 0),
        fusions_count=len(data.get("fusion_history", [])),
        backups_count=len(backups),
        site_status=site_status,
        now=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )


@app.route("/skills")
def skills_page():
    data = _load_data()
    fusion_history = data.get("fusion_history", [])
    meta = get_meta_tags("skills")
    return render_template(
        "skills.html",
        meta=meta,
        skills=data.get("skills", []),
        last_scan=data.get("last_scan"),
        scan_count=data.get("scan_count", 0),
        fusion_history=fusion_history,
        now=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )


@app.route("/sitemap.xml")
def sitemap():
    xml = generate_sitemap()
    return Response(xml, mimetype="application/xml")


@app.route("/robots.txt")
def robots():
    content = generate_robots()
    return Response(content, mimetype="text/plain")


@app.route("/api/status")
def api_status():
    data = _load_data()
    site_status = get_status()
    return jsonify({
        "site": site_status,
        "skills_count": len(data.get("skills", [])),
        "last_scan": data.get("last_scan"),
        "scan_count": data.get("scan_count", 0),
        "fusions": len(data.get("fusion_history", [])),
        "backups": len(list_backups()),
    })


@app.route("/api/scan", methods=["POST"])
@limiter.limit("2 per hour")
def api_trigger_scan():
    logger.info("Escaneo manual disparado vía API")
    result = scan_now()
    return jsonify(result)


@app.route("/login", methods=["POST"])
@limiter.limit(os.getenv("RATE_LIMIT_LOGIN", "5 per minute"))
def login():
    ip = request.remote_addr or "unknown"
    is_attack = record_login_attempt(ip, "/login")
    if is_attack:
        return jsonify({"error": "Demasiados intentos. Inténtalo más tarde."}), 429
    return jsonify({"error": "Credenciales inválidas"}), 401


@app.route("/api/modo")
def api_modo():
    return jsonify({"modo": MODO, "dry_run": MODO == "prueba"})


@app.route("/api/users")
def api_list_users():
    users = list_users()
    return jsonify({"users": users, "count": len(users)})


@app.route("/api/users/<user_id>")
def api_get_user(user_id):
    data = read_user_data(user_id)
    return jsonify(data)


@app.route("/api/users/<user_id>/skills", methods=["GET"])
def api_get_user_skills(user_id):
    data = read_user_data(user_id)
    return jsonify({"user_id": user_id, "skills": data.get("skills", []), "rubro": data.get("rubro")})


@app.route("/api/users/<user_id>/skills", methods=["POST"])
@limiter.limit("30 per hour")
def api_update_user_skills(user_id):
    body = request.get_json(silent=True) or {}
    skills = body.get("skills", [])
    rubro = body.get("rubro")
    if not isinstance(skills, list):
        return jsonify({"error": "skills debe ser una lista"}), 400
    result = update_user_skills(user_id, skills, rubro)
    if rubro and skills:
        update_conocimiento(rubro, skills, usuario_id=user_id)
    return jsonify(result)


@app.route("/api/colectivo")
def api_list_rubros():
    rubros = list_rubros()
    return jsonify({"rubros": rubros, "count": len(rubros)})


@app.route("/api/colectivo/<rubro>")
def api_get_conocimiento(rubro):
    data = get_conocimiento(rubro)
    return jsonify(data)


@app.route("/api/colectivo/<rubro>", methods=["POST"])
@limiter.limit("30 per hour")
def api_update_conocimiento(rubro):
    body = request.get_json(silent=True) or {}
    skills = body.get("skills", [])
    usuario_id = body.get("usuario_id")
    if not isinstance(skills, list):
        return jsonify({"error": "skills debe ser una lista"}), 400
    result = update_conocimiento(rubro, skills, usuario_id=usuario_id)
    return jsonify(result)


@app.route("/api/colectivo/resumen")
def api_resumen_colectivo():
    return jsonify({"rubros": get_resumen_colectivo()})


def _daily_summary_job():
    data = _load_data()
    site_status = get_status()
    skills_count = len(data.get("skills", []))
    scan_count = data.get("scan_count", 0)
    fusions_today = len(data.get("fusion_history", []))
    status_str = "🟢 Online" if site_status.get("up") else "🔴 Offline"
    send_daily_summary(skills_count, scan_count, status_str, fusions_today)


def setup_scheduler():
    scan_interval = int(os.getenv("SCAN_INTERVAL_HOURS", "6"))
    monitor_interval = int(os.getenv("MONITOR_INTERVAL_MINUTES", "5"))
    backup_hour = int(os.getenv("BACKUP_HOUR", "2"))
    summary_hour = int(os.getenv("DAILY_SUMMARY_HOUR", "9"))

    scheduler = BackgroundScheduler(timezone="UTC")

    scheduler.add_job(
        check_site,
        "interval",
        minutes=monitor_interval,
        id="monitor",
        name=f"Monitor sitio (cada {monitor_interval}min)",
        max_instances=1,
    )

    scheduler.add_job(
        scan_now,
        "interval",
        hours=scan_interval,
        id="scanner",
        name=f"Scanner skills (cada {scan_interval}h)",
        max_instances=1,
    )

    scheduler.add_job(
        run_backup,
        "cron",
        hour=backup_hour,
        minute=0,
        id="backup",
        name="Backup diario",
        max_instances=1,
    )

    scheduler.add_job(
        _daily_summary_job,
        "cron",
        hour=summary_hour,
        minute=0,
        id="daily_summary",
        name="Resumen diario Telegram",
        max_instances=1,
    )

    scheduler.start()
    logger.info(
        "Scheduler iniciado: monitor cada %dmin, scanner cada %dh, backup a las %d:00 UTC, resumen a las %d:00 UTC",
        monitor_interval,
        scan_interval,
        backup_hour,
        summary_hour,
    )
    return scheduler


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    logger.info("Iniciando HazPost Monitor en puerto %d", port)

    scheduler = setup_scheduler()

    ok = send_startup_alert()
    if ok:
        logger.info("Alerta de inicio enviada a Telegram correctamente")
    else:
        logger.warning("No se pudo enviar alerta de inicio a Telegram — verifica TELEGRAM_TOKEN y TELEGRAM_CHAT_ID")

    logger.info("Ejecutando verificación inicial del sitio...")
    check_site()

    logger.info("Ejecutando escaneo inicial de skills...")
    scan_now()

    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)
