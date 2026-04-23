import requests
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def send_telegram_message(bot_token: str, chat_id: str, message: str, parse_mode: str = 'HTML') -> bool:
    if not bot_token or not chat_id:
        logger.warning('Telegram not configured — skipping alert')
        return False

    url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
    payload = {
        'chat_id': chat_id,
        'text': message,
        'parse_mode': parse_mode,
        'disable_web_page_preview': True
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        logger.info('Telegram alert sent successfully')
        return True
    except requests.RequestException as e:
        logger.error(f'Failed to send Telegram alert: {e}')
        return False


def alert_site_down(bot_token: str, chat_id: str, site_url: str, status_code: int = None, error: str = None):
    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    msg = (
        f'🔴 <b>SITIO CAÍDO — HazPost</b>\n\n'
        f'🌐 URL: {site_url}\n'
        f'🕐 Detectado: {ts}\n'
    )
    if status_code:
        msg += f'📛 Código HTTP: {status_code}\n'
    if error:
        msg += f'⚠️ Error: {error}\n'
    msg += '\n<i>Verificar servidor y logs de inmediato.</i>'
    return send_telegram_message(bot_token, chat_id, msg)


def alert_site_recovered(bot_token: str, chat_id: str, site_url: str, downtime_minutes: float):
    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    msg = (
        f'🟢 <b>SITIO RECUPERADO — HazPost</b>\n\n'
        f'🌐 URL: {site_url}\n'
        f'🕐 Recuperado: {ts}\n'
        f'⏱ Tiempo caído: {downtime_minutes:.1f} min\n'
    )
    return send_telegram_message(bot_token, chat_id, msg)


def alert_backup_done(bot_token: str, chat_id: str, backup_file: str, size_kb: float):
    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    msg = (
        f'💾 <b>BACKUP COMPLETADO — HazPost</b>\n\n'
        f'📁 Archivo: <code>{backup_file}</code>\n'
        f'📦 Tamaño: {size_kb:.1f} KB\n'
        f'🕐 Hora: {ts}\n'
    )
    return send_telegram_message(bot_token, chat_id, msg)


def alert_backup_failed(bot_token: str, chat_id: str, error: str):
    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    msg = (
        f'❌ <b>BACKUP FALLIDO — HazPost</b>\n\n'
        f'⚠️ Error: {error}\n'
        f'🕐 Hora: {ts}\n'
        '\n<i>Revisar logs del servidor.</i>'
    )
    return send_telegram_message(bot_token, chat_id, msg)


def alert_duplicates_found(bot_token: str, chat_id: str, count: int, pairs: list):
    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    pairs_text = '\n'.join([f'  • {a} ↔ {b} ({sim:.0%})' for a, b, sim in pairs[:5]])
    msg = (
        f'🔁 <b>SKILLS DUPLICADAS DETECTADAS — HazPost</b>\n\n'
        f'🔢 Total pares duplicados: {count}\n'
        f'🕐 Detectado: {ts}\n\n'
        f'<b>Primeras duplicadas:</b>\n{pairs_text}\n'
        '\n<i>Acceder al panel /api/duplicados para fusionar.</i>'
    )
    return send_telegram_message(bot_token, chat_id, msg)


def alert_ip_unblocked(bot_token: str, chat_id: str, ip: str):
    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    msg = (
        f'🔓 <b>IP DESBLOQUEADA MANUALMENTE — HazPost Backend</b>\n\n'
        f'🌐 IP: <code>{ip}</code>\n'
        f'👤 Acción: Admin manual\n'
        f'🕐 Hora: {ts}\n'
        f'\n<i>La IP fue desbloqueada desde el panel de administración.</i>'
    )
    return send_telegram_message(bot_token, chat_id, msg)


def alert_brute_force_blocked(bot_token: str, chat_id: str, ip: str, attempt_count: int, block_duration_seconds: int):
    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    block_minutes = block_duration_seconds // 60
    msg = (
        f'🚫 <b>IP BLOQUEADA POR FUERZA BRUTA — HazPost Backend</b>\n\n'
        f'🌐 IP: <code>{ip}</code>\n'
        f'🔑 Intentos fallidos de API key: {attempt_count}\n'
        f'⏱ Bloqueo temporal: {block_minutes} minutos\n'
        f'🕐 Hora: {ts}\n'
        f'\n<i>La IP fue bloqueada automáticamente. Acceso denegado hasta que expire el bloqueo.</i>'
    )
    return send_telegram_message(bot_token, chat_id, msg)


def alert_security_event(bot_token: str, chat_id: str, event_type: str, details: str, ip: str = None):
    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    msg = (
        f'🛡️ <b>EVENTO DE SEGURIDAD — HazPost</b>\n\n'
        f'🚨 Tipo: {event_type}\n'
    )
    if ip:
        msg += f'🌐 IP: <code>{ip}</code>\n'
    msg += (
        f'📝 Detalle: {details}\n'
        f'🕐 Hora: {ts}\n'
    )
    return send_telegram_message(bot_token, chat_id, msg)


def alert_scan_report(bot_token: str, chat_id: str, report: dict):
    ts = datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')
    msg = (
        f'📊 <b>REPORTE DE ESCANEO — HazPost</b>\n\n'
        f'🌐 Sitio: {report.get("url", "hazpost.app")}\n'
        f'🕐 Fecha: {ts}\n'
        f'⚡ Tiempo respuesta: {report.get("response_time_ms", "?"):.0f} ms\n'
        f'📄 Páginas escaneadas: {report.get("pages_scanned", 0)}\n'
        f'🔧 Skills detectadas: {report.get("skills_count", 0)}\n'
        f'⚠️ Errores: {report.get("errors", 0)}\n'
        f'📈 Estado general: {report.get("status", "OK")}\n'
    )
    return send_telegram_message(bot_token, chat_id, msg)
