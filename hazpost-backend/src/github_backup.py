import os
import subprocess
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def run_github_backup() -> dict:
    """Push el código completo del workspace a GitHub cada 6 horas."""
    github_token = os.getenv('GITHUB_TOKEN', '')
    if not github_token:
        logger.warning('[GithubBackup] GITHUB_TOKEN no configurado — saltando backup')
        return {'status': 'skipped', 'reason': 'GITHUB_TOKEN not set'}

    workspace = '/home/runner/workspace'
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')

    try:
        env = os.environ.copy()

        remote_url = subprocess.check_output(
            ['git', 'remote', 'get-url', 'github'],
            cwd=workspace, env=env, text=True
        ).strip()

        if 'github.com' in remote_url and 'https://' in remote_url:
            parts = remote_url.replace('https://', '').split('@', 1)
            repo_path = parts[-1] if len(parts) > 1 else parts[0]
            auth_url = f'https://{github_token}@{repo_path}'
            subprocess.run(
                ['git', 'remote', 'set-url', 'github', auth_url],
                cwd=workspace, env=env, check=True, capture_output=True
            )

        subprocess.run(
            ['git', 'config', 'user.email', 'backup@hazpost.app'],
            cwd=workspace, env=env, check=True, capture_output=True
        )
        subprocess.run(
            ['git', 'config', 'user.name', 'HazPost Backup'],
            cwd=workspace, env=env, check=True, capture_output=True
        )

        status = subprocess.run(
            ['git', 'status', '--porcelain'],
            cwd=workspace, env=env, capture_output=True, text=True
        ).stdout.strip()

        if status:
            subprocess.run(
                ['git', 'add', '-A'],
                cwd=workspace, env=env, check=True, capture_output=True
            )
            subprocess.run(
                ['git', 'commit', '-m', f'Auto-backup {timestamp}'],
                cwd=workspace, env=env, check=True, capture_output=True
            )
            logger.info(f'[GithubBackup] Commit creado: Auto-backup {timestamp}')
        else:
            logger.info('[GithubBackup] Sin cambios desde el último backup')

        push_result = subprocess.run(
            ['git', 'push', 'github', 'main'],
            cwd=workspace, env=env, capture_output=True, text=True
        )

        if push_result.returncode != 0:
            logger.error(f'[GithubBackup] Push falló: {push_result.stderr}')
            return {'status': 'error', 'error': push_result.stderr}

        logger.info(f'[GithubBackup] Push exitoso a GitHub — {timestamp}')
        return {'status': 'success', 'timestamp': timestamp, 'had_changes': bool(status)}

    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.decode() if isinstance(e.stderr, bytes) else str(e.stderr)
        logger.error(f'[GithubBackup] Error: {error_msg}')
        return {'status': 'error', 'error': error_msg}
    except Exception as e:
        logger.error(f'[GithubBackup] Error inesperado: {e}')
        return {'status': 'error', 'error': str(e)}
