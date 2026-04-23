import os
import gzip
import json
import logging
from datetime import datetime, timezone, timedelta
from flask import Blueprint, jsonify, current_app

from src.telegram_alerts import alert_backup_done, alert_backup_failed
from src.paths import data_path
from src.security import require_api_key

logger = logging.getLogger(__name__)
backup_bp = Blueprint('backup', __name__)


def _get_backup_dir() -> str:
    backup_dir = data_path('backups')
    os.makedirs(backup_dir, exist_ok=True)
    return backup_dir


def _collect_data_snapshot() -> dict:
    data_dir = data_path()
    snapshot = {
        'created_at': datetime.now(timezone.utc).isoformat(),
        'files': {}
    }
    if not os.path.exists(data_dir):
        return snapshot
    for filename in os.listdir(data_dir):
        filepath = os.path.join(data_dir, filename)
        if os.path.isfile(filepath) and filename.endswith('.json'):
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    snapshot['files'][filename] = json.load(f)
            except (json.JSONDecodeError, IOError) as e:
                snapshot['files'][filename] = {'error': str(e)}
    return snapshot


def _remove_old_backups(backup_dir: str, retention_days: int) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    removed = 0
    for fname in os.listdir(backup_dir):
        fpath = os.path.join(backup_dir, fname)
        if os.path.isfile(fpath) and fname.endswith('.json.gz'):
            mtime = datetime.fromtimestamp(os.path.getmtime(fpath), tz=timezone.utc)
            if mtime < cutoff:
                os.remove(fpath)
                removed += 1
                logger.info(f'Removed old backup: {fname}')
    return removed


def run_backup(data_dir: str = None, retention_days: int = 30, bot_token: str = '', chat_id: str = '') -> dict:
    logger.info('Starting daily backup')
    backup_dir = _get_backup_dir()
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    backup_filename = f'hazpost_backup_{timestamp}.json.gz'
    backup_path = os.path.join(backup_dir, backup_filename)

    try:
        snapshot = _collect_data_snapshot()
        snapshot_bytes = json.dumps(snapshot, indent=2, ensure_ascii=False).encode('utf-8')

        with gzip.open(backup_path, 'wb') as f:
            f.write(snapshot_bytes)

        size_kb = os.path.getsize(backup_path) / 1024
        removed = _remove_old_backups(backup_dir, retention_days)

        result = {
            'status': 'success',
            'backup_file': backup_filename,
            'size_kb': round(size_kb, 2),
            'files_included': list(snapshot['files'].keys()),
            'old_backups_removed': removed,
            'created_at': snapshot['created_at']
        }

        if bot_token and chat_id:
            alert_backup_done(bot_token, chat_id, backup_filename, size_kb)

        logger.info(f'Backup complete: {backup_filename} ({size_kb:.1f} KB)')
        return result

    except Exception as e:
        error_msg = str(e)
        logger.error(f'Backup failed: {error_msg}')

        if bot_token and chat_id:
            alert_backup_failed(bot_token, chat_id, error_msg)

        return {'status': 'error', 'error': error_msg}


def restore_backup(backup_path: str) -> dict:
    data_dir = data_path()
    try:
        with gzip.open(backup_path, 'rb') as f:
            snapshot = json.loads(f.read().decode('utf-8'))

        restored = []
        for filename, content in snapshot.get('files', {}).items():
            dest_path = os.path.join(data_dir, filename)
            with open(dest_path, 'w', encoding='utf-8') as f:
                json.dump(content, f, indent=2, ensure_ascii=False)
            restored.append(filename)

        return {'status': 'success', 'restored_files': restored, 'backup_created_at': snapshot.get('created_at')}

    except Exception as e:
        return {'status': 'error', 'error': str(e)}


@backup_bp.route('/', methods=['GET'])
def list_backups():
    backup_dir = _get_backup_dir()
    backups = []
    for fname in sorted(os.listdir(backup_dir), reverse=True):
        if fname.endswith('.json.gz'):
            fpath = os.path.join(backup_dir, fname)
            size_kb = os.path.getsize(fpath) / 1024
            mtime = datetime.fromtimestamp(os.path.getmtime(fpath), tz=timezone.utc).isoformat()
            backups.append({'filename': fname, 'size_kb': round(size_kb, 2), 'created_at': mtime})
    return jsonify(backups)


@backup_bp.route('/run', methods=['POST'])
@require_api_key
def trigger_backup():
    retention = current_app.config.get('BACKUP_RETENTION_DAYS', 30)
    bot_token = current_app.config.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = current_app.config.get('TELEGRAM_CHAT_ID', '')
    result = run_backup(retention_days=retention, bot_token=bot_token, chat_id=chat_id)
    return jsonify(result)
