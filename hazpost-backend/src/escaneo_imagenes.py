import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from src.telegram_alerts import send_telegram_message

logger = logging.getLogger(__name__)

REGISTRO_FILENAME = 'registro_imagenes.json'
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.bmp'}
TIPOS_CARPETA = ('imagenes', 'logos')


def _registro_path(data_dir: str) -> str:
    return os.path.join(data_dir, REGISTRO_FILENAME)


def _load_registro(data_dir: str) -> dict:
    path = _registro_path(data_dir)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f'[EscaneoImagenes] Error leyendo registro: {e}')
        return {}


def _save_registro(data_dir: str, registro: dict):
    path = _registro_path(data_dir)
    tmp_path = path + '.tmp'
    try:
        with open(tmp_path, 'w') as f:
            json.dump(registro, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, path)
    except Exception as e:
        logger.error(f'[EscaneoImagenes] Error guardando registro: {e}')


def _scan_disk(data_dir: str) -> dict:
    """
    Recorre data/usuarios/*/imagenes/ y data/usuarios/*/logos/.
    Retorna un dict: {clave: {usuario, tipo, nombre, tamaño_bytes, clave}}
    donde clave = "usuario/tipo/nombre".
    """
    usuarios_dir = os.path.join(data_dir, 'usuarios')
    resultado = {}

    if not os.path.isdir(usuarios_dir):
        return resultado

    for usuario in os.listdir(usuarios_dir):
        usuario_path = os.path.join(usuarios_dir, usuario)
        if not os.path.isdir(usuario_path):
            continue

        for tipo in TIPOS_CARPETA:
            carpeta = os.path.join(usuario_path, tipo)
            if not os.path.isdir(carpeta):
                continue

            for nombre in os.listdir(carpeta):
                if Path(nombre).suffix.lower() not in IMAGE_EXTENSIONS:
                    continue
                archivo = os.path.join(carpeta, nombre)
                if not os.path.isfile(archivo):
                    continue

                try:
                    tamaño = os.path.getsize(archivo)
                except OSError:
                    tamaño = 0

                clave = f'{usuario}/{tipo}/{nombre}'
                resultado[clave] = {
                    'usuario': usuario,
                    'tipo': tipo,
                    'nombre': nombre,
                    'tamaño_bytes': tamaño,
                    'clave': clave,
                }

    return resultado


def _format_size(bytes_size: int) -> str:
    if bytes_size < 1024:
        return f'{bytes_size} B'
    kb = bytes_size / 1024
    if kb < 1024:
        return f'{kb:.1f} KB'
    return f'{kb / 1024:.2f} MB'


def _alert_imagen_nueva(bot_token: str, chat_id: str, info: dict):
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    msg = (
        f'🖼 <b>Nueva imagen detectada — HazPost</b>\n\n'
        f'👤 Usuario: <code>{info["usuario"]}</code>\n'
        f'📁 Tipo: {info["tipo"]}\n'
        f'📄 Archivo: <code>{info["nombre"]}</code>\n'
        f'📦 Tamaño: {_format_size(info["tamaño_bytes"])}\n'
        f'🕐 Detectado: {ts}'
    )
    send_telegram_message(bot_token, chat_id, msg)


def _alert_imagen_eliminada(bot_token: str, chat_id: str, clave: str, info: dict):
    ts = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    size_str = _format_size(info.get('tamaño_bytes', 0)) if info.get('tamaño_bytes') else 'desconocido'
    msg = (
        f'🗑 <b>Imagen eliminada detectada — HazPost</b>\n\n'
        f'👤 Usuario: <code>{info["usuario"]}</code>\n'
        f'📁 Tipo: {info["tipo"]}\n'
        f'📄 Archivo: <code>{info["nombre"]}</code>\n'
        f'📦 Tamaño anterior: {size_str}\n'
        f'🕐 Detectado: {ts}'
    )
    send_telegram_message(bot_token, chat_id, msg)


def run_image_scan(bot_token: str, chat_id: str, data_dir: str) -> dict:
    """
    Escanea data/usuarios/*/imagenes/ y data/usuarios/*/logos/.
    Compara contra el registro persistido, envía alertas Telegram por cada
    imagen nueva o eliminada, y actualiza el registro.
    """
    logger.info('[EscaneoImagenes] Iniciando escaneo de imágenes de usuarios...')
    start = time.time()

    registro_anterior = _load_registro(data_dir)
    estado_disco = _scan_disk(data_dir)

    claves_anteriores = {k for k in registro_anterior.keys() if not k.startswith('_')}
    claves_disco = set(estado_disco.keys())

    nuevas = claves_disco - claves_anteriores
    eliminadas = claves_anteriores - claves_disco

    for clave in sorted(nuevas):
        info = estado_disco[clave]
        logger.info(f'[EscaneoImagenes] Nueva imagen: {clave} ({_format_size(info["tamaño_bytes"])})')
        _alert_imagen_nueva(bot_token, chat_id, info)

    for clave in sorted(eliminadas):
        info = registro_anterior[clave]
        logger.info(f'[EscaneoImagenes] Imagen eliminada: {clave}')
        _alert_imagen_eliminada(bot_token, chat_id, clave, info)

    nuevo_registro = {
        **estado_disco,
        '_meta': {
            'ultimo_escaneo': datetime.now(timezone.utc).isoformat(),
            'total_imagenes': len(estado_disco),
        }
    }
    _save_registro(data_dir, nuevo_registro)

    elapsed = time.time() - start
    logger.info(
        f'[EscaneoImagenes] Escaneo completado en {elapsed:.2f}s — '
        f'{len(estado_disco)} imágenes, {len(nuevas)} nuevas, {len(eliminadas)} eliminadas'
    )

    return {
        'status': 'ok',
        'total': len(estado_disco),
        'nuevas': len(nuevas),
        'eliminadas': len(eliminadas),
        'elapsed_s': round(elapsed, 2),
    }
