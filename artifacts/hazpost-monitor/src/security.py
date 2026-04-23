import logging
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from flask import Flask, request
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from src.telegram_alerts import alert_brute_force

logger = logging.getLogger(__name__)

RATE_LIMIT_LOGIN = os.getenv("RATE_LIMIT_LOGIN", "5 per minute")

_login_attempts: dict[str, list[datetime]] = defaultdict(list)
BRUTE_FORCE_WINDOW = 60
BRUTE_FORCE_THRESHOLD = 5

limiter: Limiter = None


def init_limiter(app: Flask) -> Limiter:
    global limiter
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=[],
        storage_uri="memory://",
    )
    return limiter


def get_limiter() -> Limiter:
    return limiter


def apply_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self';"
    )
    if request.is_secure:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
    return response


def record_login_attempt(ip: str, endpoint: str = "/login") -> bool:
    """
    Registra un intento de login y devuelve True si se detecta fuerza bruta.
    """
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=BRUTE_FORCE_WINDOW)

    _login_attempts[ip] = [
        t for t in _login_attempts[ip] if t > window_start
    ]
    _login_attempts[ip].append(now)

    count = len(_login_attempts[ip])
    if count >= BRUTE_FORCE_THRESHOLD:
        logger.warning("Fuerza bruta detectada desde IP %s (%d intentos)", ip, count)
        alert_brute_force(ip, endpoint, count)
        return True
    return False
