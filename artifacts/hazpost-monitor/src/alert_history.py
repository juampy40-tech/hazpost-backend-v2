import json
import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

HISTORY_FILE = Path("data/alert_history.json")
MAX_ENTRIES = 100


def record_alert(text: str, success: bool) -> None:
    try:
        history = _load()
        preview = text[:300].replace("\n", " ")
        history.insert(0, {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "text": preview,
            "success": success,
        })
        _save(history[:MAX_ENTRIES])
    except Exception as exc:
        logger.debug("No se pudo guardar historial de alertas: %s", exc)


def get_history(limit: int = 50) -> list[dict]:
    return _load()[:limit]


def _load() -> list:
    if not HISTORY_FILE.exists():
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save(history: list) -> None:
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
