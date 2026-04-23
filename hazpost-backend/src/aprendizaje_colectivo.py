import os
import json
import logging
import hashlib
from datetime import datetime, timezone
from collections import defaultdict
from flask import Blueprint, jsonify, request

from src.paths import data_path
from src.security import require_api_key

logger = logging.getLogger(__name__)
aprendizaje_bp = Blueprint('aprendizaje', __name__)


def _anonymize_user_id(user_id: str) -> str:
    return hashlib.sha256(f'hazpost-anon-{user_id}'.encode()).hexdigest()[:16]


def _load_interactions() -> list:
    path = data_path('interactions.json')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return []


def _save_interactions(interactions: list):
    path = data_path('interactions.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(interactions, f, indent=2, ensure_ascii=False)


def _get_model_path(rubro: str) -> str:
    safe_rubro = ''.join(c for c in rubro.lower() if c.isalnum() or c in '-_')
    return data_path('models', f'{safe_rubro}_model.json')


def _load_model(rubro: str) -> dict:
    model_path = _get_model_path(rubro)
    if os.path.exists(model_path):
        try:
            with open(model_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {
        'rubro': rubro,
        'skill_frequency': {},
        'content_types': {},
        'posting_hours': {},
        'engagement_avg': 0.0,
        'sample_count': 0,
        'trained_at': None
    }


def _save_model(rubro: str, model: dict):
    model_path = _get_model_path(rubro)
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    with open(model_path, 'w', encoding='utf-8') as f:
        json.dump(model, f, indent=2, ensure_ascii=False)


def record_interaction(user_id: str, rubro: str, interaction: dict) -> dict:
    interactions = _load_interactions()
    anon_id = _anonymize_user_id(user_id)
    entry = {
        'anon_id': anon_id,
        'rubro': rubro.lower().strip(),
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'skill': interaction.get('skill'),
        'content_type': interaction.get('content_type'),
        'posting_hour': interaction.get('posting_hour'),
        'engagement_score': interaction.get('engagement_score', 0.0)
    }
    interactions.append(entry)
    if len(interactions) > 100000:
        interactions = interactions[-100000:]
    _save_interactions(interactions)
    return entry


def train_model(rubro: str) -> dict:
    interactions = _load_interactions()
    rubro_data = [i for i in interactions if i.get('rubro') == rubro.lower().strip()]

    if not rubro_data:
        return {'status': 'no_data', 'rubro': rubro}

    model = _load_model(rubro)

    skill_freq = defaultdict(int)
    content_types = defaultdict(int)
    posting_hours = defaultdict(int)
    engagement_sum = 0.0
    engagement_count = 0

    for record in rubro_data:
        if record.get('skill'):
            skill_freq[record['skill']] += 1
        if record.get('content_type'):
            content_types[record['content_type']] += 1
        if record.get('posting_hour') is not None:
            posting_hours[str(record['posting_hour'])] += 1
        if record.get('engagement_score', 0) > 0:
            engagement_sum += record['engagement_score']
            engagement_count += 1

    model.update({
        'rubro': rubro,
        'skill_frequency': dict(sorted(skill_freq.items(), key=lambda x: x[1], reverse=True)),
        'content_types': dict(sorted(content_types.items(), key=lambda x: x[1], reverse=True)),
        'posting_hours': dict(sorted(posting_hours.items(), key=lambda x: x[1], reverse=True)),
        'engagement_avg': round(engagement_sum / engagement_count, 4) if engagement_count > 0 else 0.0,
        'sample_count': len(rubro_data),
        'trained_at': datetime.now(timezone.utc).isoformat()
    })

    _save_model(rubro, model)
    logger.info(f'Model trained for rubro "{rubro}": {len(rubro_data)} samples')
    return {'status': 'trained', 'model': model}


def get_suggestions(rubro: str, limit: int = 5) -> dict:
    model = _load_model(rubro)

    if not model.get('trained_at'):
        return {
            'rubro': rubro,
            'suggestions': [],
            'message': 'No hay datos suficientes para este rubro aún.'
        }

    top_skills = list(model['skill_frequency'].keys())[:limit]
    top_content = list(model['content_types'].keys())[:3]
    top_hours = list(model['posting_hours'].keys())[:3]

    return {
        'rubro': rubro,
        'suggested_skills': top_skills,
        'best_content_types': top_content,
        'best_posting_hours': [int(h) for h in top_hours if h.isdigit()],
        'avg_engagement': model['engagement_avg'],
        'based_on_samples': model['sample_count'],
        'trained_at': model['trained_at']
    }


def list_available_rubros() -> list:
    models_dir = data_path('models')
    if not os.path.exists(models_dir):
        return []
    rubros = []
    for fname in os.listdir(models_dir):
        if fname.endswith('_model.json'):
            model = _load_model(fname[:-11])
            rubros.append({
                'rubro': model.get('rubro'),
                'sample_count': model.get('sample_count', 0),
                'trained_at': model.get('trained_at')
            })
    return sorted(rubros, key=lambda x: x['sample_count'], reverse=True)


@aprendizaje_bp.route('/rubros', methods=['GET'])
def get_rubros():
    return jsonify(list_available_rubros())


@aprendizaje_bp.route('/sugerencias/<rubro>', methods=['GET'])
def get_rubro_suggestions(rubro):
    limit = int(request.args.get('limit', 5))
    suggestions = get_suggestions(rubro, limit)
    return jsonify(suggestions)


@aprendizaje_bp.route('/interaccion', methods=['POST'])
@require_api_key
def record_new_interaction():
    data = request.get_json()
    if not data or 'user_id' not in data or 'rubro' not in data:
        return jsonify({'error': 'user_id and rubro are required'}), 400

    entry = record_interaction(data['user_id'], data['rubro'], data)
    return jsonify({'status': 'recorded', 'anon_id': entry['anon_id']}), 201


@aprendizaje_bp.route('/entrenar/<rubro>', methods=['POST'])
@require_api_key
def trigger_training(rubro):
    result = train_model(rubro)
    return jsonify(result)


@aprendizaje_bp.route('/entrenar-todos', methods=['POST'])
@require_api_key
def train_all():
    interactions = _load_interactions()
    rubros = list({i['rubro'] for i in interactions if i.get('rubro')})
    results = []
    for rubro in rubros:
        result = train_model(rubro)
        results.append({'rubro': rubro, 'status': result.get('status')})
    return jsonify({'trained': len(results), 'results': results})
