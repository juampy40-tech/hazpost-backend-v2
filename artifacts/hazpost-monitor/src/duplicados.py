import logging
from datetime import datetime, timezone
from pathlib import Path

from thefuzz import fuzz

from src.telegram_alerts import alert_fusion

logger = logging.getLogger(__name__)

DATA_FILE = Path("data/skills_auto.json")
SIMILARITY_THRESHOLD = 80


def detect_and_merge(skills: list[str]) -> tuple[list[str], list[dict]]:
    """
    Recibe lista de skills y fusiona los que tienen >80% similitud.
    Retorna (lista_limpia, fusion_log).
    El llamador es responsable de persistir el fusion_log.
    Los alertas Telegram se envían aquí como efecto secundario.
    """
    if not skills:
        return skills, []

    merged: list[str] = []
    fusion_log: list[dict] = []

    for skill in skills:
        found_match = False
        for existing in merged:
            ratio = fuzz.token_sort_ratio(skill.lower(), existing.lower())
            if ratio >= SIMILARITY_THRESHOLD:
                logger.info(
                    "Fusión detectada: '%s' → '%s' (similitud: %d%%)",
                    skill,
                    existing,
                    ratio,
                )
                fusion_log.append({
                    "original": skill,
                    "merged_into": existing,
                    "similarity": ratio,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                alert_fusion(skill, existing)
                found_match = True
                break
        if not found_match:
            merged.append(skill)

    return merged, fusion_log


def get_fusion_history() -> list[dict]:
    import json
    if DATA_FILE.exists():
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("fusion_history", [])
    return []
