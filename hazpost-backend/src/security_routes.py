import time
import logging
from flask import Blueprint, jsonify, request, current_app
from src.telegram_alerts import alert_ip_unblocked
from src.security import (
    require_api_key,
    BLOCKED_IPS,
    _TEMP_BLOCK_EXPIRY,
    _is_temp_blocked,
    FAILED_AUTH_ATTEMPTS,
    unblock_ip,
    AUTH_FAIL_WINDOW_SECONDS,
    AUTH_BLOCK_DURATION_SECONDS,
    AUTH_FAIL_THRESHOLD,
    BLOCK_EVENTS,
    _persist_state,
)

logger = logging.getLogger(__name__)

security_bp = Blueprint('security', __name__)


@security_bp.route('/blocked-ips', methods=['GET'])
@require_api_key
def list_blocked_ips():
    now = time.time()
    result = []
    for ip in list(BLOCKED_IPS):
        expiry = _TEMP_BLOCK_EXPIRY.get(ip)
        if expiry is not None:
            if not _is_temp_blocked(ip):
                continue
            remaining_seconds = max(0, int(expiry - now))
            expires_at = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(expiry))
            block_type = 'temporary'
        else:
            remaining_seconds = None
            expires_at = None
            block_type = 'permanent'

        attempts = FAILED_AUTH_ATTEMPTS.get(ip, [])
        window = AUTH_BLOCK_DURATION_SECONDS if block_type == 'temporary' else AUTH_FAIL_WINDOW_SECONDS
        recent_attempts = [t for t in attempts if now - t < window]
        result.append({
            'ip': ip,
            'block_type': block_type,
            'expires_at': expires_at,
            'remaining_seconds': remaining_seconds,
            'failed_attempts': len(recent_attempts),
        })

    result.sort(key=lambda x: (x['remaining_seconds'] is None, x['remaining_seconds'] or 0), reverse=True)
    return jsonify({'blocked_ips': result, 'total': len(result)})


@security_bp.route('/blocked-ips/<path:ip>', methods=['DELETE'])
@require_api_key
def unblock_ip_endpoint(ip: str):
    if ip not in BLOCKED_IPS:
        return jsonify({'error': 'IP not found in blocked list'}), 404
    unblock_ip(ip)
    logger.info(f'Admin manually unblocked IP: {ip}')
    bot_token = current_app.config.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = current_app.config.get('TELEGRAM_CHAT_ID', '')
    alert_ip_unblocked(bot_token, chat_id, ip)
    return jsonify({'success': True, 'message': f'IP {ip} has been unblocked'})


@security_bp.route('/failed-attempts', methods=['GET'])
@require_api_key
def list_failed_attempts():
    now = time.time()
    result = []
    for ip, timestamps in list(FAILED_AUTH_ATTEMPTS.items()):
        recent = [t for t in timestamps if now - t < AUTH_FAIL_WINDOW_SECONDS]
        if not recent:
            continue
        count = len(recent)
        remaining_to_block = max(0, AUTH_FAIL_THRESHOLD - count)
        is_blocked = ip in BLOCKED_IPS
        oldest = min(recent)
        window_resets_in = max(0, int(AUTH_FAIL_WINDOW_SECONDS - (now - oldest)))
        result.append({
            'ip': ip,
            'count': count,
            'threshold': AUTH_FAIL_THRESHOLD,
            'remaining_to_block': remaining_to_block,
            'is_blocked': is_blocked,
            'window_resets_in': window_resets_in,
        })
    result.sort(key=lambda x: x['count'], reverse=True)
    return jsonify({'failed_attempts': result, 'total': len(result), 'threshold': AUTH_FAIL_THRESHOLD})


@security_bp.route('/failed-attempts/<path:ip>', methods=['DELETE'])
@require_api_key
def reset_failed_attempts(ip: str):
    if ip not in FAILED_AUTH_ATTEMPTS:
        return jsonify({'error': 'IP no encontrada en intentos fallidos'}), 404
    FAILED_AUTH_ATTEMPTS.pop(ip, None)
    _persist_state()
    logger.info(f'Admin reset failed attempts for IP: {ip}')
    return jsonify({'success': True, 'message': f'Intentos de {ip} reseteados'})


@security_bp.route('/block-history', methods=['GET'])
@require_api_key
def block_history():
    try:
        limit = min(int(request.args.get('limit', 100)), 500)
    except (ValueError, TypeError):
        limit = 100

    ip_filter = request.args.get('ip', '').strip()

    events = list(reversed(BLOCK_EVENTS))
    if ip_filter:
        events = [e for e in events if e['ip'] == ip_filter]

    total = len(events)
    events = events[:limit]

    return jsonify({'events': events, 'total': total, 'limit': limit})
