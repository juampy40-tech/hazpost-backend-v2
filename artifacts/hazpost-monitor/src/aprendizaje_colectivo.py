import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from thefuzz import fuzz

logger = logging.getLogger(__name__)

COLECTIVO_DIR = Path("data/conocimiento_colectivo")
SIMILARITY_THRESHOLD = int(os.getenv("COLECTIVO_SIMILARITY_THRESHOLD", "75"))
MODO = os.getenv("MODO", "produccion").lower()


def _is_dry_run() -> bool:
    return MODO == "prueba"


def _rubro_file(rubro: str) -> Path:
    safe = "".join(c for c in rubro.lower().replace(" ", "_") if c.isalnum() or c == "_")
    return COLECTIVO_DIR / f"{safe}.json"


def _load_rubro(rubro: str) -> dict:
    f = _rubro_file(rubro)
    if not f.exists():
        return {"rubro": rubro, "skills": [], "usuarios_count": 0, "updated_at": None}
    with open(f, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _save_rubro(rubro: str, data: dict) -> None:
    if _is_dry_run():
        logger.info("[PRUEBA] _save_rubro(%s) — %d skills, no se guarda", rubro, len(data.get("skills", [])))
        return
    COLECTIVO_DIR.mkdir(parents=True, exist_ok=True)
    f = _rubro_file(rubro)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    with open(f, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    logger.debug("Conocimiento colectivo guardado: %s (%d skills)", rubro, len(data.get("skills", [])))


def _merge_skills(existing: list[str], nuevos: list[str]) -> tuple[list[str], int]:
    merged = list(existing)
    added = 0
    for skill in nuevos:
        is_dup = any(
            fuzz.token_sort_ratio(skill.lower(), ex.lower()) >= SIMILARITY_THRESHOLD
            for ex in merged
        )
        if not is_dup:
            merged.append(skill)
            added += 1
    return merged, added


def get_conocimiento(rubro: str) -> dict:
    return _load_rubro(rubro)


def update_conocimiento(rubro: str, nuevos_skills: list[str], usuario_id: str | None = None) -> dict:
    data = _load_rubro(rubro)
    merged, added = _merge_skills(data.get("skills", []), nuevos_skills)
    data["skills"] = merged
    data["usuarios_count"] = data.get("usuarios_count", 0) + (1 if usuario_id else 0)
    if added > 0:
        logger.info(
            "Aprendizaje colectivo [%s]: +%d skills nuevos (total: %d)",
            rubro, added, len(merged),
        )
    _save_rubro(rubro, data)
    return {"rubro": rubro, "total_skills": len(merged), "nuevos_agregados": added}


def list_rubros() -> list[str]:
    if not COLECTIVO_DIR.exists():
        return []
    return sorted(
        f.stem
        for f in COLECTIVO_DIR.glob("*.json")
    )


def get_resumen() -> list[dict]:
    return [_load_rubro(r) for r in list_rubros()]


def ensure_base_dirs() -> None:
    if _is_dry_run():
        logger.info("[PRUEBA] ensure_base_dirs (colectivo) — directorio no creado")
        return
    COLECTIVO_DIR.mkdir(parents=True, exist_ok=True)
    logger.debug("Directorio colectivo asegurado: %s", COLECTIVO_DIR)
