import logging
import os

from app import app, check_site, scan_now, setup_scheduler

logger = logging.getLogger(__name__)

_SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
_ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")

if _SECRET_KEY == "change-me-in-production":
    logger.warning(
        "⚠️  SECRET_KEY usa el valor por defecto. "
        "Configura la variable de entorno SECRET_KEY con un valor aleatorio seguro."
    )

if not _ADMIN_PASSWORD:
    logger.warning(
        "⚠️  ADMIN_PASSWORD no está configurada. "
        "El panel /admin estará bloqueado hasta que definas esta variable de entorno."
    )

_scheduler = setup_scheduler()
logger.info("Verificación inicial del sitio...")
check_site()
logger.info("Escaneo inicial de skills...")
scan_now()
