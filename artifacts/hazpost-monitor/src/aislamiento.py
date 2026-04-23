import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

USERS_DIR = Path("data/usuarios")
MODO = os.getenv("MODO", "produccion").lower()


def _is_dry_run() -> bool:
    return MODO == "prueba"


def get_user_dir(user_id: str) -> Path:
    safe_id = "".join(c for c in str(user_id) if c.isalnum() or c in "-_")
    if not safe_id:
        raise ValueError(f"user_id inválido: {user_id!r}")
    return USERS_DIR / f"usuario_{safe_id}"


def ensure_user_dir(user_id: str) -> Path:
    user_dir = get_user_dir(user_id)
    if _is_dry_run():
        logger.debug("[PRUEBA] ensure_user_dir(%s) — no se crea en disco", user_id)
        return user_dir
    user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir


def read_user_data(user_id: str) -> dict:
    user_dir = get_user_dir(user_id)
    data_file = user_dir / "data.json"
    if not data_file.exists():
        return {"user_id": user_id, "skills": [], "rubro": None, "created_at": None, "updated_at": None}
    with open(data_file, "r", encoding="utf-8") as f:
        return json.load(f)


def write_user_data(user_id: str, data: dict) -> bool:
    if _is_dry_run():
        logger.info("[PRUEBA] write_user_data(%s) — datos simulados: %s", user_id, list(data.keys()))
        return True
    user_dir = ensure_user_dir(user_id)
    data_file = user_dir / "data.json"
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    if "created_at" not in data or not data["created_at"]:
        data["created_at"] = data["updated_at"]
    with open(data_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.debug("write_user_data(%s) — guardado en %s", user_id, data_file)
    return True


def update_user_skills(user_id: str, skills: list[str], rubro: str | None = None) -> dict:
    data = read_user_data(user_id)
    data["user_id"] = user_id
    data["skills"] = skills
    if rubro:
        data["rubro"] = rubro
    write_user_data(user_id, data)
    return data


def list_users() -> list[str]:
    if not USERS_DIR.exists():
        return []
    return sorted(
        d.name.removeprefix("usuario_")
        for d in USERS_DIR.iterdir()
        if d.is_dir() and d.name.startswith("usuario_")
    )


def get_all_users_data() -> list[dict]:
    return [read_user_data(uid) for uid in list_users()]


def ensure_base_dirs() -> None:
    if _is_dry_run():
        logger.info("[PRUEBA] ensure_base_dirs — directorios no creados (modo prueba)")
        return
    USERS_DIR.mkdir(parents=True, exist_ok=True)
    logger.debug("Directorio de usuarios asegurado: %s", USERS_DIR)
