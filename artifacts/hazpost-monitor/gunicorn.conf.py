import os
from pathlib import Path

Path("logs").mkdir(exist_ok=True)

bind = "0.0.0.0:" + os.getenv("PORT", "5000")
workers = 1
threads = 4
timeout = 120
worker_class = "sync"
loglevel = os.getenv("LOG_LEVEL", "info").lower()
accesslog = "-"
errorlog = "-"
preload_app = False
