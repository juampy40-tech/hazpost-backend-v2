import logging
import os
import tarfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

from src.telegram_alerts import alert_backup_ok, alert_backup_failed

logger = logging.getLogger(__name__)

BACKUP_DIR = Path("backups")
BACKUP_RETENTION_DAYS = 30

DIRS_TO_BACKUP = ["data", "logs"]
FILES_TO_BACKUP = [".env"]


def run_backup() -> str:
    """
    Crea un backup comprimido de data/, logs/ y .env
    y elimina backups más antiguos de 30 días.
    """
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    filename = f"backup_{now.strftime('%Y%m%d_%H%M%S')}.tar.gz"
    filepath = BACKUP_DIR / filename

    try:
        with tarfile.open(filepath, "w:gz") as tar:
            for dir_name in DIRS_TO_BACKUP:
                path = Path(dir_name)
                if path.exists():
                    tar.add(path, arcname=dir_name)
                    logger.debug("Añadido al backup: %s", dir_name)
                else:
                    logger.debug("Directorio no encontrado, omitido: %s", dir_name)

            for file_name in FILES_TO_BACKUP:
                path = Path(file_name)
                if path.exists():
                    tar.add(path, arcname=file_name)
                    logger.debug("Añadido al backup: %s", file_name)

        size_kb = filepath.stat().st_size // 1024
        logger.info("Backup creado: %s (%dKB)", filename, size_kb)
        alert_backup_ok(filename)
        _cleanup_old_backups()
        return filename

    except Exception as exc:
        logger.error("Error creando backup: %s", exc)
        alert_backup_failed(str(exc))
        if filepath.exists():
            filepath.unlink()
        raise


def _cleanup_old_backups() -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=BACKUP_RETENTION_DAYS)
    removed = 0
    for backup_file in BACKUP_DIR.glob("backup_*.tar.gz"):
        mtime = datetime.fromtimestamp(backup_file.stat().st_mtime, tz=timezone.utc)
        if mtime < cutoff:
            backup_file.unlink()
            logger.info("Backup eliminado (>%d días): %s", BACKUP_RETENTION_DAYS, backup_file.name)
            removed += 1
    if removed:
        logger.info("Backups eliminados por antigüedad: %d", removed)


def list_backups() -> list[dict]:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backups = []
    for backup_file in sorted(BACKUP_DIR.glob("backup_*.tar.gz"), reverse=True):
        stat = backup_file.stat()
        backups.append({
            "name": backup_file.name,
            "size_kb": stat.st_size // 1024,
            "created": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        })
    return backups
