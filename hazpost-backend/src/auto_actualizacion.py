import logging
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

from src.telegram_alerts import send_telegram_message

logger = logging.getLogger(__name__)

WORKSPACE = '/home/runner/workspace'
BRANCH = 'main'
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'logs')
UPDATE_LOG = os.path.join(LOG_DIR, 'actualizaciones.log')


def _git(args: list, cwd: str = WORKSPACE, check: bool = True):
    """Ejecuta un comando git y retorna el resultado."""
    return subprocess.run(
        ['git'] + args,
        cwd=cwd,
        env=os.environ.copy(),
        capture_output=True,
        text=True,
        check=check,
    )


def _detect_remote() -> str:
    """
    Detecta el nombre del remote de GitHub en el repositorio actual.
    Prueba 'origin' primero (estándar). Si no existe, busca el primer remote
    cuya URL contenga 'github.com'. Fallback: 'origin'.
    """
    try:
        result = _git(['remote', '-v'], check=False)
        lines = result.stdout.strip().splitlines()
        remotes = {}
        for line in lines:
            parts = line.split()
            if len(parts) >= 2 and '(fetch)' in line:
                remotes[parts[0]] = parts[1]
        if 'origin' in remotes:
            return 'origin'
        for name, url in remotes.items():
            if 'github.com' in url:
                return name
    except Exception:
        pass
    return 'origin'


def _get_commit_hash(ref: str) -> str:
    """Retorna el hash completo del commit apuntado por ref, o '' si falla."""
    try:
        result = _git(['rev-parse', ref])
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return ''


def _get_new_commits(local_hash: str, remote_hash: str) -> list[str]:
    """
    Retorna las líneas de log de commits en remote que no están en local.
    Formato: "hash: mensaje (autor)"
    """
    try:
        result = _git(['log', '--oneline', '--no-decorate', f'{local_hash}..{remote_hash}'])
        lines = [l.strip() for l in result.stdout.strip().splitlines() if l.strip()]
        return lines
    except subprocess.CalledProcessError:
        return []


def _write_update_log(entry: str):
    os.makedirs(LOG_DIR, exist_ok=True)
    try:
        with open(UPDATE_LOG, 'a', encoding='utf-8') as f:
            f.write(entry + '\n')
    except Exception as e:
        logger.error(f'[AutoActualizacion] Error escribiendo log: {e}')


def _alert_updated(bot_token: str, chat_id: str, n_commits: int, commit_lines: list[str]):
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    commits_text = '\n'.join(f'• {c}' for c in commit_lines[:10])
    if len(commit_lines) > 10:
        commits_text += f'\n… y {len(commit_lines) - 10} más'
    msg = (
        f'📦 <b>Actualización automática — HazPost Backend</b>\n\n'
        f'🔄 {n_commits} commit{"s" if n_commits != 1 else ""} nuevo{"s" if n_commits != 1 else ""} aplicado{"s" if n_commits != 1 else ""}:\n'
        f'{commits_text}\n\n'
        f'🕐 {ts}\n'
        f'♻️ <i>Reiniciando servidor...</i>'
    )
    send_telegram_message(bot_token, chat_id, msg)


def _alert_error(bot_token: str, chat_id: str, error: str):
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    msg = (
        f'⚠️ <b>Error en auto-actualización — HazPost Backend</b>\n\n'
        f'❌ {error}\n'
        f'🕐 {ts}'
    )
    send_telegram_message(bot_token, chat_id, msg)


def check_and_update(bot_token: str, chat_id: str) -> dict:
    """
    Compara HEAD local contra {remote}/main usando rev-list --count para
    determinar si el remote tiene commits que el local no tiene.

    - Remote adelante (count > 0): pull + Telegram + reinicio.
    - Remote igual o local adelante (count == 0): solo log, sin alerta.
    - Repo sucio (archivos tracked modificados): skip sin alerta.
    - Error de fetch/pull: log + alerta Telegram.
    """
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    logger.info('[AutoActualizacion] Verificando actualizaciones desde GitHub...')

    remote = _detect_remote()
    logger.info(f'[AutoActualizacion] Usando remote: {remote!r}')

    try:
        _git(['fetch', remote, BRANCH])
    except subprocess.CalledProcessError as e:
        error = e.stderr.strip() if e.stderr else str(e)
        msg = f'[{ts}] ERROR en git fetch: {error}'
        _write_update_log(msg)
        logger.error(f'[AutoActualizacion] git fetch falló: {error}')
        _alert_error(bot_token, chat_id, f'git fetch falló: {error}')
        return {'status': 'error', 'error': error}

    try:
        ahead_result = _git(['rev-list', '--count', f'HEAD..{remote}/{BRANCH}'])
        ahead_count = int(ahead_result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError) as e:
        msg = f'[{ts}] ERROR — no se pudo contar commits nuevos: {e}'
        _write_update_log(msg)
        logger.error(f'[AutoActualizacion] rev-list falló: {e}')
        return {'status': 'error', 'error': str(e)}

    if ahead_count == 0:
        local_hash = _get_commit_hash('HEAD')
        msg = f'[{ts}] OK — sin commits nuevos en {remote}/{BRANCH} (HEAD={local_hash[:8] if local_hash else "?"})'
        _write_update_log(msg)
        logger.info(f'[AutoActualizacion] Sin commits nuevos en {remote}/{BRANCH}')
        return {'status': 'up_to_date', 'ahead_count': 0}

    tracked_changes = _git(['diff', 'HEAD', '--name-only'], check=False).stdout.strip()
    if tracked_changes:
        msg = (
            f'[{ts}] SKIP pull — {ahead_count} commit(s) disponibles pero '
            f'hay {len(tracked_changes.splitlines())} archivo(s) tracked con cambios'
        )
        _write_update_log(msg)
        logger.warning(
            f'[AutoActualizacion] Pull omitido: {len(tracked_changes.splitlines())} archivo(s) '
            'tracked con cambios sin commitear. En producción este campo debe estar limpio.'
        )
        return {'status': 'skipped_dirty', 'ahead_count': ahead_count}

    local_hash = _get_commit_hash('HEAD')
    remote_hash = _get_commit_hash(f'{remote}/{BRANCH}')
    new_commits = _get_new_commits(local_hash or '', remote_hash or '')

    logger.info(f'[AutoActualizacion] {ahead_count} commit(s) nuevo(s) en remote, aplicando pull...')

    try:
        _git(['pull', '--ff-only', remote, BRANCH])
    except subprocess.CalledProcessError as e:
        error = e.stderr.strip() if e.stderr else str(e)
        msg = f'[{ts}] ERROR en git pull: {error}'
        _write_update_log(msg)
        logger.error(f'[AutoActualizacion] git pull falló: {error}')
        _alert_error(bot_token, chat_id, f'git pull falló: {error}')
        return {'status': 'error', 'error': error}

    msg = f'[{ts}] UPDATE — {ahead_count} commit(s) nuevos en {remote}/{BRANCH}'
    _write_update_log(msg)
    for c in new_commits:
        _write_update_log(f'  {c}')

    _alert_updated(bot_token, chat_id, ahead_count, new_commits)

    logger.info('[AutoActualizacion] Pull exitoso. Reiniciando servidor...')
    time.sleep(1)
    os.execv(sys.executable, sys.argv)
