import logging
import os
import time
from datetime import datetime, timezone

import requests

from src.telegram_alerts import alert_site_down, alert_site_slow, alert_site_recovered

logger = logging.getLogger(__name__)

TARGET_URL = os.getenv("TARGET_URL", "https://hazpost.app")
SLOW_THRESHOLD = 2.0

_last_status: dict = {
    "up": True,
    "slow": False,
    "last_check": None,
    "response_time": None,
    "error": None,
}


def get_status() -> dict:
    return _last_status.copy()


def check_site() -> dict:
    global _last_status
    was_up = _last_status.get("up", True)
    result = {
        "url": TARGET_URL,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "up": False,
        "response_time": None,
        "error": None,
    }

    try:
        start = time.monotonic()
        resp = requests.get(TARGET_URL, timeout=10, headers={
            "User-Agent": "HazPost-Monitor/1.0"
        })
        elapsed = time.monotonic() - start
        result["response_time"] = round(elapsed, 3)

        if resp.status_code < 500:
            result["up"] = True
            if elapsed > SLOW_THRESHOLD:
                logger.warning("Respuesta lenta: %.2fs", elapsed)
                alert_site_slow(TARGET_URL, elapsed)
            elif not was_up:
                logger.info("Sitio recuperado: %s", TARGET_URL)
                alert_site_recovered(TARGET_URL)
        else:
            result["error"] = f"HTTP {resp.status_code}"
            if was_up:
                alert_site_down(TARGET_URL, result["error"])
    except Exception as exc:
        result["error"] = str(exc)
        if was_up:
            logger.error("Sitio caído: %s — %s", TARGET_URL, exc)
            alert_site_down(TARGET_URL, str(exc))

    is_slow = bool(
        result["up"]
        and result["response_time"] is not None
        and result["response_time"] > SLOW_THRESHOLD
    )
    _last_status = {
        "up": result["up"],
        "slow": is_slow,
        "last_check": result["timestamp"],
        "response_time": result["response_time"],
        "error": result["error"],
    }
    return result
