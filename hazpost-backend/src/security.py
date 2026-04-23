import fcntl
import json
import os
import time
import logging
from functools import wraps
from flask import request, jsonify, current_app
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import src.rate_limit_storage  # noqa: F401 — registers "filesystem://" scheme with limits

logger = logging.getLogger(__name__)

BLOCKED_IPS = set()

_TEMP_BLOCK_EXPIRY: dict = {}

FAILED_AUTH_ATTEMPTS: dict = {}

BLOCK_EVENTS: list = []
_MAX_BLOCK_EVENTS = 500


def _record_block_event(ip: str, event: str, origin: str):
    BLOCK_EVENTS.append({
        'ip': ip,
        'event': event,
        'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'origin': origin,
    })
    if len(BLOCK_EVENTS) > _MAX_BLOCK_EVENTS:
        del BLOCK_EVENTS[:-_MAX_BLOCK_EVENTS]

AUTH_FAIL_THRESHOLD = 10
AUTH_FAIL_WINDOW_SECONDS = 60
AUTH_BLOCK_DURATION_SECONDS = 300

_PERSIST_PATH: str | None = None

SUSPICIOUS_USER_AGENTS = [
    'sqlmap', 'nikto', 'masscan', 'zgrab', 'nmap',
    'dirbuster', 'gobuster', 'wfuzz', 'hydra'
]

SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "font-src 'self' data:; "
        "connect-src 'self';"
    )
}


def _persist_state():
    if not _PERSIST_PATH:
        return
    lock_path = _PERSIST_PATH + '.lock'
    try:
        state = {
            'temp_blocks': _TEMP_BLOCK_EXPIRY,
            'failed_attempts': {ip: attempts for ip, attempts in FAILED_AUTH_ATTEMPTS.items()},
            'permanent_blocks': list(BLOCKED_IPS - set(_TEMP_BLOCK_EXPIRY.keys())),
        }
        tmp_path = _PERSIST_PATH + '.tmp'
        with open(lock_path, 'w') as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                with open(tmp_path, 'w') as f:
                    json.dump(state, f)
                os.replace(tmp_path, _PERSIST_PATH)
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)
    except Exception as e:
        logger.error(f'Failed to persist IP block state: {e}')


def _load_state(path: str):
    global _PERSIST_PATH
    _PERSIST_PATH = path

    if not os.path.exists(path):
        logger.info('No IP block state file found — starting fresh')
        return

    lock_path = path + '.lock'
    try:
        with open(lock_path, 'a') as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_SH)
            try:
                with open(path, 'r') as f:
                    state = json.load(f)
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)
    except Exception as e:
        logger.error(f'Failed to load IP block state from {path}: {e}')
        return

    now = time.time()
    restored_temp = 0
    restored_perm = 0
    restored_attempts = 0
    skipped = 0

    for ip, expiry in state.get('temp_blocks', {}).items():
        try:
            if not isinstance(ip, str) or not isinstance(expiry, (int, float)):
                raise ValueError(f'invalid entry: ip={ip!r} expiry={expiry!r}')
            if expiry > now:
                _TEMP_BLOCK_EXPIRY[ip] = float(expiry)
                BLOCKED_IPS.add(ip)
                restored_temp += 1
        except Exception as e:
            skipped += 1
            logger.warning(f'Skipping bad temp_block entry: {e}')

    for ip in state.get('permanent_blocks', []):
        try:
            if not isinstance(ip, str):
                raise ValueError(f'invalid permanent block ip: {ip!r}')
            BLOCKED_IPS.add(ip)
            restored_perm += 1
        except Exception as e:
            skipped += 1
            logger.warning(f'Skipping bad permanent_block entry: {e}')

    for ip, attempts in state.get('failed_attempts', {}).items():
        try:
            if not isinstance(ip, str) or not isinstance(attempts, list):
                raise ValueError(f'invalid failed_attempts entry: ip={ip!r}')
            recent = [float(t) for t in attempts if isinstance(t, (int, float)) and now - t < AUTH_FAIL_WINDOW_SECONDS]
            if recent:
                FAILED_AUTH_ATTEMPTS[ip] = recent
                restored_attempts += 1
        except Exception as e:
            skipped += 1
            logger.warning(f'Skipping bad failed_attempts entry: {e}')

    logger.info(
        f'Restored IP block state: {restored_temp} temp blocks, '
        f'{restored_perm} permanent blocks, '
        f'{restored_attempts} IPs with recent failed attempts'
        + (f', {skipped} bad entries skipped' if skipped else '')
    )


def _get_rate_limit_key():
    user_id = request.headers.get('X-User-ID')
    if user_id:
        safe = ''.join(c for c in str(user_id) if c.isalnum() or c in '-_')
        if safe:
            return f'user:{safe}'
    return get_remote_address()


limiter = Limiter(
    key_func=_get_rate_limit_key,
    default_limits=['200 per day', '50 per hour'],
)


def _is_temp_blocked(ip: str) -> bool:
    expiry = _TEMP_BLOCK_EXPIRY.get(ip)
    if expiry is None:
        return False
    if time.time() > expiry:
        BLOCKED_IPS.discard(ip)
        del _TEMP_BLOCK_EXPIRY[ip]
        FAILED_AUTH_ATTEMPTS.pop(ip, None)
        _persist_state()
        logger.info(f'Temporary block expired for IP: {ip}')
        _record_block_event(ip, 'unblocked', 'automatic')
        return False
    return True


def _record_failed_auth(ip: str) -> int:
    now = time.time()
    attempts = FAILED_AUTH_ATTEMPTS.get(ip, [])
    attempts = [t for t in attempts if now - t < AUTH_FAIL_WINDOW_SECONDS]
    attempts.append(now)
    FAILED_AUTH_ATTEMPTS[ip] = attempts
    _persist_state()
    logger.warning(
        f'Failed API key attempt from {ip} — '
        f'{len(attempts)}/{AUTH_FAIL_THRESHOLD} in the last {AUTH_FAIL_WINDOW_SECONDS}s'
    )
    return len(attempts)


def _temp_block_ip(ip: str):
    BLOCKED_IPS.add(ip)
    _TEMP_BLOCK_EXPIRY[ip] = time.time() + AUTH_BLOCK_DURATION_SECONDS
    _persist_state()
    logger.warning(
        f'IP {ip} temporarily blocked for {AUTH_BLOCK_DURATION_SECONDS}s '
        f'after {AUTH_FAIL_THRESHOLD} failed API key attempts'
    )
    _record_block_event(ip, 'blocked', 'automatic')


def init_security(app):
    data_dir = app.config.get('DATA_DIR', os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data'))
    os.makedirs(data_dir, exist_ok=True)
    persist_path = os.path.join(data_dir, 'ip_blocks.json')
    _load_state(persist_path)

    rate_limit_path = os.path.abspath(os.path.join(data_dir, 'rate_limits.json'))
    app.config['RATELIMIT_STORAGE_URI'] = f'filesystem://{rate_limit_path}'
    logger.info(f'Rate-limit storage: filesystem at {rate_limit_path}')

    limiter.init_app(app)

    @app.after_request
    def add_security_headers(response):
        for header, value in SECURITY_HEADERS.items():
            response.headers[header] = value
        return response

    @app.before_request
    def check_blocked_ip():
        ip = get_remote_address()

        if ip in BLOCKED_IPS:
            if _is_temp_blocked(ip):
                remaining = int(_TEMP_BLOCK_EXPIRY.get(ip, 0) - time.time())
                logger.warning(f'Blocked IP attempted access: {ip} (temp block, {remaining}s remaining)')
                return jsonify({'error': 'Access denied — too many failed authentication attempts'}), 403
            elif ip in BLOCKED_IPS:
                logger.warning(f'Blocked IP attempted access: {ip}')
                return jsonify({'error': 'Access denied'}), 403

        ua = request.headers.get('User-Agent', '').lower()
        if any(bot in ua for bot in SUSPICIOUS_USER_AGENTS):
            logger.warning(f'Suspicious user-agent from {ip}: {ua}')
            return jsonify({'error': 'Access denied'}), 403

    logger.info('Security middleware initialized — rate limiting by user-id (X-User-ID header) with IP fallback')
    return app


def require_api_key(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        expected_key = current_app.config.get('API_KEY', '')
        if not expected_key or api_key == expected_key:
            ip = get_remote_address()
            if ip in FAILED_AUTH_ATTEMPTS:
                FAILED_AUTH_ATTEMPTS.pop(ip, None)
                _persist_state()
            return f(*args, **kwargs)

        ip = get_remote_address()
        fail_count = _record_failed_auth(ip)

        if fail_count >= AUTH_FAIL_THRESHOLD:
            _temp_block_ip(ip)
            _send_brute_force_alert(ip, fail_count)
            return jsonify({'error': 'Access denied — too many failed authentication attempts'}), 403

        return jsonify({'error': 'Invalid or missing API key'}), 401
    return decorated


def _send_brute_force_alert(ip: str, attempt_count: int):
    try:
        from flask import current_app
        from src.telegram_alerts import alert_brute_force_blocked
        bot_token = current_app.config.get('TELEGRAM_BOT_TOKEN', '')
        chat_id = current_app.config.get('TELEGRAM_CHAT_ID', '')
        alert_brute_force_blocked(bot_token, chat_id, ip, attempt_count, AUTH_BLOCK_DURATION_SECONDS)
    except Exception as e:
        logger.error(f'Failed to send brute-force Telegram alert: {e}')


def block_ip(ip: str):
    BLOCKED_IPS.add(ip)
    _persist_state()
    logger.info(f'Blocked IP: {ip}')
    _record_block_event(ip, 'blocked', 'manual')


def unblock_ip(ip: str, origin: str = 'manual'):
    BLOCKED_IPS.discard(ip)
    _TEMP_BLOCK_EXPIRY.pop(ip, None)
    FAILED_AUTH_ATTEMPTS.pop(ip, None)
    _persist_state()
    logger.info(f'Unblocked IP: {ip}')
    _record_block_event(ip, 'unblocked', origin)


def get_blocked_ips() -> list:
    return list(BLOCKED_IPS)
