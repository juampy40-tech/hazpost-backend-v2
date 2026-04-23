import os
import logging
import requests

logger = logging.getLogger(__name__)

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
TARGET_URL = os.getenv("TARGET_URL", "https://hazpost.app")


def _send(text: str) -> bool:
    from src.alert_history import record_alert

    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        logger.warning("Telegram no configurado — TOKEN o CHAT_ID faltante")
        record_alert(text, success=False)
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
    }
    try:
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        record_alert(text, success=True)
        return True
    except Exception as exc:
        logger.error("Error enviando alerta Telegram: %s", exc)
        record_alert(text, success=False)
        return False


def alert_new_skills(skills: list[str]) -> None:
    if not skills:
        return
    lista = "\n".join(f"  • {s}" for s in skills)
    _send(f"🆕 <b>Skills nuevos detectados en {TARGET_URL}</b>\n{lista}")


def alert_missing_skills(skills: list[str]) -> None:
    if not skills:
        return
    lista = "\n".join(f"  • {s}" for s in skills)
    _send(f"⚠️ <b>Skills desaparecidos en {TARGET_URL}</b>\n{lista}")


def alert_fusion(original: str, merged_into: str) -> None:
    _send(
        f"🔀 <b>Skills fusionados</b>\n"
        f"  <i>{original}</i> → <i>{merged_into}</i>\n"
        f"  (similitud >80%)"
    )


def alert_site_down(url: str, error: str) -> None:
    _send(f"🔴 <b>SITIO CAÍDO</b>\n{url}\nError: <code>{error}</code>")


def alert_site_slow(url: str, response_time: float) -> None:
    _send(
        f"🐢 <b>Respuesta lenta</b>\n{url}\n"
        f"Tiempo de respuesta: <b>{response_time:.2f}s</b> (umbral: 2s)"
    )


def alert_site_recovered(url: str) -> None:
    _send(f"🟢 <b>Sitio recuperado</b>\n{url} está respondiendo correctamente.")


def alert_backup_ok(filename: str) -> None:
    _send(f"✅ <b>Backup completado</b>\nArchivo: <code>{filename}</code>")


def alert_backup_failed(error: str) -> None:
    _send(f"❌ <b>Backup fallido</b>\nError: <code>{error}</code>")


def alert_brute_force(ip: str, endpoint: str, attempts: int) -> None:
    _send(
        f"🚨 <b>Posible ataque de fuerza bruta</b>\n"
        f"IP: <code>{ip}</code>\n"
        f"Endpoint: <code>{endpoint}</code>\n"
        f"Intentos: {attempts}"
    )


def send_startup_alert() -> bool:
    return _send(
        f"✅ <b>Monitor HazPost iniciado</b>\n"
        f"🌐 Vigilando: {TARGET_URL}\n"
        f"📡 Bot de Telegram conectado correctamente."
    )


def send_daily_summary(skills_count: int, scan_count: int, site_status: str, fusions_today: int) -> None:
    _send(
        f"📊 <b>Resumen diario — Monitor HazPost</b>\n"
        f"🌐 Sitio monitoreado: {TARGET_URL}\n"
        f"📌 Skills detectados: <b>{skills_count}</b>\n"
        f"🔍 Escaneos realizados hoy: <b>{scan_count}</b>\n"
        f"🔀 Fusiones hoy: <b>{fusions_today}</b>\n"
        f"💡 Estado del sitio: <b>{site_status}</b>"
    )
