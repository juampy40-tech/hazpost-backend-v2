import os
import json
import logging
import time
from datetime import datetime, timezone
from flask import Blueprint, jsonify, current_app
import requests

from src.telegram_alerts import alert_site_down, alert_site_recovered
from src.paths import data_path
from src.security import require_api_key

logger = logging.getLogger(__name__)
monitor_bp = Blueprint('monitor', __name__)


def _load_state() -> dict:
    path = data_path('monitor_state.json')
    if os.path.exists(path):
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {'is_down': False, 'down_since': None, 'last_check': None, 'last_status_code': None}


def _save_state(state: dict):
    path = data_path('monitor_state.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(state, f, indent=2)


def check_site_status(target_url: str, bot_token: str = '', chat_id: str = '') -> dict:
    state = _load_state()
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        start = time.time()
        resp = requests.get(target_url, timeout=15, allow_redirects=True)
        elapsed_ms = (time.time() - start) * 1000
        is_up = resp.status_code < 500

        if is_up:
            if state.get('is_down') and state.get('down_since'):
                down_since = datetime.fromisoformat(state['down_since'])
                downtime_minutes = (datetime.now(timezone.utc) - down_since).total_seconds() / 60
                alert_site_recovered(bot_token, chat_id, target_url, downtime_minutes)
                logger.info(f'Site recovered after {downtime_minutes:.1f} min')

            state.update({
                'is_down': False,
                'down_since': None,
                'last_check': now_iso,
                'last_status_code': resp.status_code,
                'last_response_time_ms': round(elapsed_ms, 1)
            })
        else:
            if not state.get('is_down'):
                state['down_since'] = now_iso
                alert_site_down(bot_token, chat_id, target_url, status_code=resp.status_code)
                logger.error(f'Site DOWN: {target_url} returned {resp.status_code}')

            state.update({
                'is_down': True,
                'last_check': now_iso,
                'last_status_code': resp.status_code
            })

    except requests.RequestException as e:
        error_msg = str(e)
        if not state.get('is_down'):
            state['down_since'] = now_iso
            alert_site_down(bot_token, chat_id, target_url, error=error_msg)
            logger.error(f'Site DOWN (connection error): {error_msg}')

        state.update({
            'is_down': True,
            'last_check': now_iso,
            'last_status_code': None,
            'last_error': error_msg
        })

    _save_state(state)
    return state


@monitor_bp.route('/', methods=['GET'])
def get_status():
    state = _load_state()
    return jsonify(state)


@monitor_bp.route('/check', methods=['POST'])
@require_api_key
def force_check():
    target = current_app.config.get('TARGET_SITE', 'https://hazpost.app')
    bot_token = current_app.config.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = current_app.config.get('TELEGRAM_CHAT_ID', '')
    result = check_site_status(target, bot_token, chat_id)
    return jsonify(result)


@monitor_bp.route('/history', methods=['GET'])
def get_history():
    history_path = data_path('monitor_history.json')
    if os.path.exists(history_path):
        with open(history_path, 'r') as f:
            return jsonify(json.load(f))
    return jsonify([])
