import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

from src.duplicados import detect_and_merge
from src.telegram_alerts import alert_new_skills, alert_missing_skills

logger = logging.getLogger(__name__)

TARGET_URL = os.getenv("TARGET_URL", "https://hazpost.app")
DATA_FILE = Path("data/skills_auto.json")


def _load_data() -> dict:
    if DATA_FILE.exists():
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"skills": [], "last_scan": None, "fusion_history": [], "scan_count": 0}


def _save_data(data: dict) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _extract_skills(html: str) -> list[str]:
    """
    Extrae skills/características de la página de hazpost.app.
    Busca en múltiples selectores comunes para capturar features/benefits.
    """
    soup = BeautifulSoup(html, "html.parser")
    skills: list[str] = []

    selectors = [
        "[data-skill]",
        ".skill",
        ".feature",
        ".feature-title",
        ".benefit",
        ".benefit-title",
        ".card-title",
        ".plan-feature",
        "h3",
        "h4",
        ".feature-name",
        ".skill-name",
        "li.feature",
        "[class*='skill']",
        "[class*='feature']",
        "[class*='benefit']",
    ]

    seen = set()
    for selector in selectors:
        for el in soup.select(selector):
            text = el.get_text(strip=True)
            if text and len(text) > 3 and len(text) < 120:
                key = text.lower()
                if key not in seen:
                    seen.add(key)
                    skills.append(text)

    if not skills:
        for tag in soup.find_all(["h2", "h3", "h4", "li"]):
            text = tag.get_text(strip=True)
            if text and 5 < len(text) < 80:
                key = text.lower()
                if key not in seen:
                    seen.add(key)
                    skills.append(text)

    return skills[:100]


def scan_now() -> dict:
    """Ejecuta un escaneo de hazpost.app y actualiza skills_auto.json."""
    logger.info("Iniciando escaneo de %s", TARGET_URL)
    data = _load_data()
    previous_skills: list[str] = data.get("skills", [])

    try:
        resp = requests.get(TARGET_URL, timeout=15, headers={
            "User-Agent": "HazPost-Monitor/1.0 (+https://hazpost.app)"
        })
        resp.raise_for_status()
        raw_skills = _extract_skills(resp.text)
    except Exception as exc:
        logger.error("Error al escanear %s: %s", TARGET_URL, exc)
        return {"error": str(exc), "skills": previous_skills}

    clean_skills, fusion_log = detect_and_merge(raw_skills)

    prev_set = set(s.lower() for s in previous_skills)
    curr_set = set(s.lower() for s in clean_skills)

    new_skills = [s for s in clean_skills if s.lower() not in prev_set]
    missing_skills = [s for s in previous_skills if s.lower() not in curr_set]

    if new_skills:
        logger.info("Skills nuevos: %s", new_skills)
        alert_new_skills(new_skills)

    if missing_skills:
        logger.info("Skills desaparecidos: %s", missing_skills)
        alert_missing_skills(missing_skills)

    now = datetime.now(timezone.utc).isoformat()
    if "fusion_history" not in data:
        data["fusion_history"] = []
    data["fusion_history"].extend(fusion_log)
    data["skills"] = clean_skills
    data["last_scan"] = now
    data["scan_count"] = data.get("scan_count", 0) + 1
    _save_data(data)

    logger.info(
        "Escaneo completado: %d skills detectados, %d nuevos, %d desaparecidos, %d fusiones",
        len(clean_skills),
        len(new_skills),
        len(missing_skills),
        len(fusion_log),
    )
    return {
        "skills": clean_skills,
        "new": new_skills,
        "missing": missing_skills,
        "last_scan": now,
        "fusions": len(fusion_log),
    }
