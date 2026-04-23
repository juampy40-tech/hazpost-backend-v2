import fcntl
import json
import logging
import os
import threading
import time
from urllib.parse import urlparse

from limits.storage import Storage, SCHEMES

logger = logging.getLogger(__name__)


class FilesystemStorage(Storage):
    """
    Filesystem-backed storage for Flask-Limiter.

    Persists rate-limit counters to a JSON file so they survive server restarts.
    Each mutating operation (incr, reset, clear) performs an atomic read-modify-write
    protected by an fcntl advisory lock, guaranteeing correctness across multiple
    processes (e.g. gunicorn workers) and threads simultaneously.

    URI format: filesystem:///absolute/path/to/rate_limits.json
    """

    STORAGE_SCHEME = "filesystem"

    def __init__(self, uri: str, **kwargs):
        parsed = urlparse(uri)
        self._path = parsed.path
        if not self._path:
            raise ValueError(f"[RateLimitStorage] Invalid filesystem URI: {uri!r}")
        os.makedirs(os.path.dirname(self._path), exist_ok=True)
        self._thread_lock = threading.Lock()
        restored = self._count_active_entries()
        logger.info(
            f"[RateLimitStorage] Initialized at {self._path} "
            f"({restored} active entries restored)"
        )

    def _count_active_entries(self) -> int:
        """Return the number of non-expired entries currently on disk (for logging only)."""
        data = self._read_disk()
        now = time.time()
        return sum(1 for v in data.values() if v.get("reset_at", 0) > now)

    def _read_disk(self) -> dict:
        """Read raw data from disk (no locking — caller must hold appropriate lock)."""
        if not os.path.exists(self._path):
            return {}
        try:
            with open(self._path, "r") as f:
                raw = json.load(f)
            if not isinstance(raw, dict):
                return {}
            return raw
        except Exception as e:
            logger.error(f"[RateLimitStorage] Read error: {e}")
            return {}

    def _write_disk(self, data: dict):
        """Write data to disk atomically (no locking — caller must hold exclusive lock)."""
        tmp_path = self._path + ".tmp"
        try:
            with open(tmp_path, "w") as f:
                json.dump(data, f)
            os.replace(tmp_path, self._path)
        except Exception as e:
            logger.error(f"[RateLimitStorage] Write error: {e}")

    def _atomic_modify(self, modify_fn):
        """
        Read-modify-write under both a threading lock (intra-process) and an
        fcntl exclusive lock (inter-process). The modify_fn receives the current
        dict (expired entries already pruned) and returns the desired result value.
        """
        lock_path = self._path + ".lock"
        now = time.time()
        with self._thread_lock:
            with open(lock_path, "a") as lf:
                fcntl.flock(lf, fcntl.LOCK_EX)
                try:
                    data = self._read_disk()
                    data = {
                        k: v
                        for k, v in data.items()
                        if isinstance(v, dict) and v.get("reset_at", 0) > now
                    }
                    result = modify_fn(data, now)
                    self._write_disk(data)
                    return result
                finally:
                    fcntl.flock(lf, fcntl.LOCK_UN)

    def incr(self, key: str, expiry: int, amount: int = 1) -> int:
        def _do(data: dict, now: float) -> int:
            entry = data.get(key)
            if entry is None or entry["reset_at"] <= now:
                data[key] = {"count": amount, "reset_at": now + expiry}
            else:
                data[key]["count"] += amount
            return data[key]["count"]

        return self._atomic_modify(_do)

    def get(self, key: str) -> int:
        """Read current count from disk with a shared lock."""
        lock_path = self._path + ".lock"
        now = time.time()
        with self._thread_lock:
            with open(lock_path, "a") as lf:
                fcntl.flock(lf, fcntl.LOCK_SH)
                try:
                    data = self._read_disk()
                finally:
                    fcntl.flock(lf, fcntl.LOCK_UN)
        entry = data.get(key)
        if entry is None or entry.get("reset_at", 0) <= now:
            return 0
        return int(entry.get("count", 0))

    def get_expiry(self, key: str) -> float:
        """Read reset timestamp from disk."""
        lock_path = self._path + ".lock"
        with self._thread_lock:
            with open(lock_path, "a") as lf:
                fcntl.flock(lf, fcntl.LOCK_SH)
                try:
                    data = self._read_disk()
                finally:
                    fcntl.flock(lf, fcntl.LOCK_UN)
        entry = data.get(key)
        if entry is None:
            return time.time()
        return float(entry.get("reset_at", time.time()))

    @property
    def base_exceptions(self):
        return OSError

    def check(self) -> bool:
        return True

    def reset(self) -> int:
        def _do(data: dict, now: float) -> int:
            count = len(data)
            data.clear()
            return count

        return self._atomic_modify(_do)

    def clear(self, key: str) -> None:
        def _do(data: dict, now: float) -> None:
            data.pop(key, None)

        self._atomic_modify(_do)


if "filesystem" not in SCHEMES:
    SCHEMES["filesystem"] = FilesystemStorage
