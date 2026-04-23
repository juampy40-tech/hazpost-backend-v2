import os
import json
import logging
from difflib import SequenceMatcher
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request

from src.paths import data_path
from src.security import require_api_key

logger = logging.getLogger(__name__)
duplicados_bp = Blueprint('duplicados', __name__)

SIMILARITY_THRESHOLD = 0.80


def _load_skills() -> list:
    path = data_path('skills.json')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return []


def _save_skills(skills: list):
    path = data_path('skills.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(skills, f, indent=2, ensure_ascii=False)


def _load_report() -> dict:
    path = data_path('duplicates_report.json')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {}


def _save_report(report: dict):
    path = data_path('duplicates_report.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def find_duplicates(skills: list, threshold: float = SIMILARITY_THRESHOLD) -> list:
    pairs = []
    for i in range(len(skills)):
        for j in range(i + 1, len(skills)):
            name_a = skills[i].get('name', '')
            name_b = skills[j].get('name', '')
            sim = _similarity(name_a, name_b)
            if sim >= threshold:
                pairs.append({
                    'skill_a': skills[i],
                    'skill_b': skills[j],
                    'similarity': round(sim, 4),
                    'index_a': i,
                    'index_b': j
                })
    return sorted(pairs, key=lambda x: x['similarity'], reverse=True)


def merge_skills(skill_a: dict, skill_b: dict) -> dict:
    merged = dict(skill_a)
    merged['aliases'] = merged.get('aliases', [])

    if skill_b.get('name') and skill_b['name'] not in merged['aliases']:
        merged['aliases'].append(skill_b['name'])

    for key in ['description', 'category', 'tags']:
        if not merged.get(key) and skill_b.get(key):
            merged[key] = skill_b[key]

    merged['merged_from'] = skill_b.get('id', skill_b.get('name', 'unknown'))
    merged['merged_at'] = datetime.now(timezone.utc).isoformat()
    return merged


def run_duplicate_detection(threshold: float = SIMILARITY_THRESHOLD) -> dict:
    skills = _load_skills()
    if not skills:
        return {'status': 'no_skills', 'pairs': [], 'count': 0}

    pairs = find_duplicates(skills, threshold)
    report = {
        'detected_at': datetime.now(timezone.utc).isoformat(),
        'total_skills': len(skills),
        'duplicate_pairs': len(pairs),
        'threshold': threshold,
        'pairs': [
            {
                'skill_a': p['skill_a'].get('name'),
                'skill_b': p['skill_b'].get('name'),
                'similarity': p['similarity']
            }
            for p in pairs
        ]
    }
    _save_report(report)

    logger.info(f'Duplicate detection: {len(pairs)} pairs found among {len(skills)} skills')
    return {'status': 'done', 'pairs': pairs[:20], 'count': len(pairs)}


@duplicados_bp.route('/', methods=['GET'])
def list_duplicates():
    threshold = float(request.args.get('threshold', SIMILARITY_THRESHOLD))
    result = run_duplicate_detection(threshold)
    return jsonify({
        'count': result['count'],
        'threshold': threshold,
        'pairs': [
            {
                'skill_a': p['skill_a'].get('name'),
                'skill_b': p['skill_b'].get('name'),
                'similarity': p['similarity'],
                'index_a': p['index_a'],
                'index_b': p['index_b']
            }
            for p in result.get('pairs', [])
        ]
    })


@duplicados_bp.route('/merge', methods=['POST'])
@require_api_key
def merge_duplicate():
    data = request.get_json()
    if not data or 'index_keep' not in data or 'index_remove' not in data:
        return jsonify({'error': 'index_keep and index_remove are required'}), 400

    skills = _load_skills()
    idx_keep = int(data['index_keep'])
    idx_remove = int(data['index_remove'])

    if idx_keep >= len(skills) or idx_remove >= len(skills):
        return jsonify({'error': 'Index out of range'}), 400

    merged = merge_skills(skills[idx_keep], skills[idx_remove])
    skills[idx_keep] = merged
    skills.pop(idx_remove)
    _save_skills(skills)

    logger.info(f'Merged skill at index {idx_remove} into {idx_keep}')
    return jsonify({'status': 'merged', 'result': merged, 'remaining_skills': len(skills)})


@duplicados_bp.route('/skills', methods=['GET'])
def list_skills():
    skills = _load_skills()
    return jsonify({'count': len(skills), 'skills': skills})


@duplicados_bp.route('/skills', methods=['POST'])
@require_api_key
def add_skill():
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({'error': 'name is required'}), 400

    skills = _load_skills()
    data['created_at'] = datetime.now(timezone.utc).isoformat()
    if 'id' not in data:
        data['id'] = f'skill_{len(skills) + 1}_{int(datetime.now().timestamp())}'
    skills.append(data)
    _save_skills(skills)
    return jsonify({'status': 'added', 'skill': data}), 201
