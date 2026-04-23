import os
import json
import time
import logging
from datetime import datetime, timezone
from urllib.parse import urljoin
from flask import Blueprint, jsonify, current_app
import requests
from bs4 import BeautifulSoup

from src.telegram_alerts import alert_scan_report
from src.paths import data_path
from src.security import require_api_key

logger = logging.getLogger(__name__)
scanner_bp = Blueprint('scanner', __name__)

PAGES_TO_SCAN = [
    '/',
    '/pricing',
    '/features',
    '/about',
    '/blog',
    '/login',
    '/signup',
]

SKILL_SELECTORS = [
    '[data-skill]',
    '.skill-card',
    '.skill-item',
    '[class*="skill-"]',
    '[id*="skill-"]',
    '.feature-card',
    '.feature-item',
    '[data-feature]',
]


def _load_results() -> list:
    path = data_path('scan_results.json')
    if os.path.exists(path):
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return []


def _save_results(results: list):
    path = data_path('scan_results.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


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


def _extract_skill_records(soup: BeautifulSoup, page_url: str, scanned_at: str) -> list:
    skills = []
    seen_names = set()

    for selector in SKILL_SELECTORS:
        try:
            elements = soup.select(selector)
            for el in elements:
                name = (
                    el.get('data-skill')
                    or el.get('data-feature')
                    or el.get('aria-label')
                    or el.get('title')
                    or el.get_text(separator=' ', strip=True)
                )
                if not name:
                    continue
                name = ' '.join(name.split())[:120]
                if not name or name in seen_names:
                    continue
                seen_names.add(name)

                category = el.get('data-category') or el.get('data-type') or None
                tags_raw = el.get('data-tags', '')
                tags = [t.strip() for t in tags_raw.split(',') if t.strip()] if tags_raw else []

                skills.append({
                    'name': name,
                    'category': category,
                    'tags': tags,
                    'page_url': page_url,
                    'status': 'active',
                    'source': 'scanner',
                    'discovered_at': scanned_at,
                })
        except Exception:
            continue

    nav_links = soup.select('nav a, .nav a, header a')
    for link in nav_links:
        text = link.get_text(strip=True)
        if text and 3 < len(text) < 60 and text not in seen_names:
            seen_names.add(text)
            skills.append({
                'name': text,
                'category': 'navegacion',
                'tags': [],
                'page_url': page_url,
                'status': 'active',
                'source': 'scanner-nav',
                'discovered_at': scanned_at,
            })

    return skills


def _merge_skills_into_store(new_skills: list, scanned_at: str) -> int:
    existing = _load_skills()
    existing_names = {s['name'].lower() for s in existing}
    added = 0
    for skill in new_skills:
        if skill['name'].lower() not in existing_names:
            skill['id'] = f'skill_{len(existing) + added + 1}_{int(datetime.now().timestamp())}'
            existing.append(skill)
            existing_names.add(skill['name'].lower())
            added += 1
        else:
            for s in existing:
                if s['name'].lower() == skill['name'].lower():
                    s['last_seen'] = scanned_at
                    s['page_url'] = skill['page_url']
                    break
    _save_skills(existing)
    return added


def _scan_page(session: requests.Session, url: str, scanned_at: str) -> tuple:
    result = {'url': url, 'status': 'error', 'status_code': None, 'response_time_ms': None}
    skill_records = []
    try:
        start = time.time()
        resp = session.get(url, timeout=15, allow_redirects=True)
        elapsed = (time.time() - start) * 1000
        result['status_code'] = resp.status_code
        result['response_time_ms'] = round(elapsed, 1)

        if resp.status_code == 200:
            result['status'] = 'ok'
            soup = BeautifulSoup(resp.text, 'html.parser')

            title = soup.find('title')
            result['title'] = title.get_text(strip=True) if title else None

            meta_desc = soup.find('meta', attrs={'name': 'description'})
            result['meta_description'] = meta_desc.get('content', '') if meta_desc else None

            og_image = soup.find('meta', attrs={'property': 'og:image'})
            result['og_image'] = og_image.get('content', '') if og_image else None

            h1_tags = [h.get_text(strip=True) for h in soup.find_all('h1')]
            result['h1_tags'] = h1_tags

            images = soup.find_all('img')
            result['images_without_alt'] = len([img for img in images if not img.get('alt')])
            result['total_images'] = len(images)

            links = soup.find_all('a', href=True)
            result['total_links'] = len(links)

            skill_records = _extract_skill_records(soup, url, scanned_at)
            result['skills_detected'] = len(skill_records)
        else:
            result['status'] = 'error'

    except requests.RequestException as e:
        result['error'] = str(e)

    return result, skill_records


def run_full_scan(target_url: str, bot_token: str = '', chat_id: str = '') -> dict:
    logger.info(f'Starting full scan of {target_url}')
    started_at = datetime.now(timezone.utc).isoformat()
    page_results = []
    all_skill_records = []
    total_skills = 0
    total_errors = 0
    response_times = []

    session = requests.Session()
    session.headers.update({'User-Agent': 'HazPost-Scanner/1.0 (+https://hazpost.app)'})

    for path in PAGES_TO_SCAN:
        url = urljoin(target_url, path)
        page_data, skill_records = _scan_page(session, url, started_at)
        page_results.append(page_data)
        all_skill_records.extend(skill_records)

        if page_data['status'] == 'ok':
            total_skills += page_data.get('skills_detected', 0)
            if page_data['response_time_ms']:
                response_times.append(page_data['response_time_ms'])
        else:
            total_errors += 1

    new_skills_added = _merge_skills_into_store(all_skill_records, started_at)
    logger.info(f'Skills persisted: {new_skills_added} new, {len(all_skill_records)} total detected')

    avg_response_ms = sum(response_times) / len(response_times) if response_times else 0

    scan_summary = {
        'url': target_url,
        'started_at': started_at,
        'completed_at': datetime.now(timezone.utc).isoformat(),
        'pages_scanned': len(page_results),
        'skills_count': total_skills,
        'new_skills_added': new_skills_added,
        'errors': total_errors,
        'avg_response_time_ms': round(avg_response_ms, 1),
        'response_time_ms': round(avg_response_ms, 1),
        'status': 'OK' if total_errors == 0 else f'{total_errors} ERRORES',
        'pages': page_results
    }

    all_results = _load_results()
    all_results.append(scan_summary)
    all_results = all_results[-50:]
    _save_results(all_results)

    if bot_token and chat_id:
        alert_scan_report(bot_token, chat_id, scan_summary)

    logger.info(f'Scan complete: {len(page_results)} pages, {total_errors} errors')
    return scan_summary


@scanner_bp.route('/', methods=['GET'])
def get_latest_scan():
    results = _load_results()
    if results:
        return jsonify(results[-1])
    return jsonify({'message': 'No scan results yet'}), 404


@scanner_bp.route('/history', methods=['GET'])
def get_scan_history():
    results = _load_results()
    summaries = [{k: v for k, v in r.items() if k != 'pages'} for r in results]
    return jsonify(summaries)


@scanner_bp.route('/run', methods=['POST'])
@require_api_key
def trigger_scan():
    target = current_app.config.get('TARGET_SITE', 'https://hazpost.app')
    bot_token = current_app.config.get('TELEGRAM_BOT_TOKEN', '')
    chat_id = current_app.config.get('TELEGRAM_CHAT_ID', '')
    result = run_full_scan(target, bot_token, chat_id)
    return jsonify(result)


@scanner_bp.route('/skills', methods=['GET'])
def get_skills():
    skills = _load_skills()
    return jsonify(skills)
