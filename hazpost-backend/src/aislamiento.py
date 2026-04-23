import os
import json
import logging
from functools import wraps
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request, g

from src.paths import data_path
from src.security import require_api_key

logger = logging.getLogger(__name__)
aislamiento_bp = Blueprint('aislamiento', __name__)


def _user_data_dir(user_id: str) -> str:
    safe_id = ''.join(c for c in str(user_id) if c.isalnum() or c in '-_')
    if not safe_id:
        raise ValueError('Invalid user_id')
    path = data_path('users', safe_id)
    os.makedirs(path, exist_ok=True)
    return path


def require_user(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user_id = (
            request.headers.get('X-User-ID')
            or request.args.get('user_id')
            or (request.get_json(silent=True) or {}).get('user_id')
        )
        if not user_id:
            return jsonify({'error': 'X-User-ID header or user_id param required'}), 401

        safe_id = ''.join(c for c in str(user_id) if c.isalnum() or c in '-_')
        if not safe_id:
            return jsonify({'error': 'Invalid user_id format'}), 400

        g.user_id = safe_id
        logger.debug(f'Request authenticated for user: {safe_id}')
        return f(*args, **kwargs)
    return decorated


def user_read(user_id: str, key: str, default=None):
    data_dir = _user_data_dir(user_id)
    file_path = os.path.join(data_dir, f'{key}.json')
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return default


def user_write(user_id: str, key: str, value) -> bool:
    data_dir = _user_data_dir(user_id)
    file_path = os.path.join(data_dir, f'{key}.json')
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(value, f, indent=2, ensure_ascii=False)
        return True
    except IOError as e:
        logger.error(f'Failed to write user data {user_id}/{key}: {e}')
        return False


def user_delete(user_id: str, key: str) -> bool:
    data_dir = _user_data_dir(user_id)
    file_path = os.path.join(data_dir, f'{key}.json')
    if os.path.exists(file_path):
        os.remove(file_path)
        return True
    return False


def user_list_keys(user_id: str) -> list:
    try:
        data_dir = _user_data_dir(user_id)
        return [f[:-5] for f in os.listdir(data_dir) if f.endswith('.json')]
    except Exception:
        return []


def validate_cross_user_access(requesting_user_id: str, target_user_id: str) -> bool:
    if requesting_user_id != target_user_id:
        logger.warning(
            f'Cross-user access attempt: {requesting_user_id} tried to access {target_user_id} data'
        )
        return False
    return True


@aislamiento_bp.route('/data/<key>', methods=['GET'])
@require_user
def get_user_data(key):
    value = user_read(g.user_id, key)
    if value is None:
        return jsonify({'error': 'Key not found'}), 404
    return jsonify({'user_id': g.user_id, 'key': key, 'value': value})


@aislamiento_bp.route('/data/<key>', methods=['PUT', 'POST'])
@require_api_key
@require_user
def set_user_data(key):
    body = request.get_json()
    if body is None:
        return jsonify({'error': 'JSON body required'}), 400

    if 'user_id' in body:
        if not validate_cross_user_access(g.user_id, str(body['user_id'])):
            return jsonify({'error': 'Cross-user access not allowed'}), 403

    payload = {
        'value': body.get('value', body),
        'updated_at': datetime.now(timezone.utc).isoformat(),
        'user_id': g.user_id
    }
    user_write(g.user_id, key, payload)
    return jsonify({'status': 'ok', 'key': key})


@aislamiento_bp.route('/data/<key>', methods=['DELETE'])
@require_api_key
@require_user
def delete_user_data(key):
    deleted = user_delete(g.user_id, key)
    return jsonify({'status': 'deleted' if deleted else 'not_found', 'key': key})


@aislamiento_bp.route('/data', methods=['GET'])
@require_user
def list_user_keys():
    keys = user_list_keys(g.user_id)
    return jsonify({'user_id': g.user_id, 'keys': keys, 'count': len(keys)})


@aislamiento_bp.route('/validate', methods=['POST'])
@require_api_key
@require_user
def validate_isolation():
    body = request.get_json() or {}
    target_user = str(body.get('target_user_id', ''))
    is_valid = validate_cross_user_access(g.user_id, target_user) if target_user else True
    return jsonify({
        'requesting_user': g.user_id,
        'target_user': target_user,
        'access_granted': is_valid
    })
