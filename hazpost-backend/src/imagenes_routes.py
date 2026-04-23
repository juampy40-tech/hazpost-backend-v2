import os
import re
import logging
from flask import Blueprint, jsonify, request, current_app
from werkzeug.utils import secure_filename
from src.security import require_api_key

logger = logging.getLogger(__name__)
imagenes_bp = Blueprint('imagenes', __name__)

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp'}
MAX_FILE_SIZE = 20 * 1024 * 1024

_USUARIO_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_\-]{0,63}$')


def _get_dir(data_dir: str, usuario: str, tipo: str) -> str | None:
    if tipo not in ('imagenes', 'logos'):
        return None
    if not _USUARIO_RE.match(usuario):
        return None
    return os.path.join(data_dir, 'usuarios', usuario, tipo)


def _allowed(filename: str) -> bool:
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[-1].lower()
    return ext in ALLOWED_EXTENSIONS


def _format_stat(filepath: str) -> dict:
    stat = os.stat(filepath)
    return {
        'nombre': os.path.basename(filepath),
        'tamano': stat.st_size,
        'modificado': stat.st_mtime,
    }


@imagenes_bp.route('/listar', methods=['GET'])
@require_api_key
def listar():
    usuario = request.args.get('usuario', '').strip()
    tipo = request.args.get('tipo', '').strip()
    data_dir = current_app.config['DATA_DIR']

    if not usuario:
        return jsonify({'error': 'Parámetro usuario requerido'}), 400
    if tipo not in ('imagenes', 'logos'):
        return jsonify({'error': 'tipo debe ser imagenes o logos'}), 400

    directory = _get_dir(data_dir, usuario, tipo)
    if directory is None:
        return jsonify({'error': 'Parámetros inválidos'}), 400

    if not os.path.isdir(directory):
        return jsonify({'usuario': usuario, 'tipo': tipo, 'archivos': []})

    archivos = []
    for nombre in sorted(os.listdir(directory)):
        filepath = os.path.join(directory, nombre)
        if not os.path.isfile(filepath):
            continue
        ext = nombre.rsplit('.', 1)[-1].lower() if '.' in nombre else ''
        if ext not in ALLOWED_EXTENSIONS:
            continue
        archivos.append(_format_stat(filepath))

    return jsonify({'usuario': usuario, 'tipo': tipo, 'archivos': archivos})


@imagenes_bp.route('/subir', methods=['POST'])
@require_api_key
def subir():
    data_dir = current_app.config['DATA_DIR']
    usuario = request.form.get('usuario', '').strip()
    tipo = request.form.get('tipo', '').strip()

    if not usuario:
        return jsonify({'error': 'Campo usuario requerido'}), 400
    if tipo not in ('imagenes', 'logos'):
        return jsonify({'error': 'Campo tipo debe ser imagenes o logos'}), 400
    if 'archivo' not in request.files:
        return jsonify({'error': 'Campo archivo requerido'}), 400

    f = request.files['archivo']
    if not f.filename:
        return jsonify({'error': 'Nombre de archivo vacío'}), 400
    if not _allowed(f.filename):
        return jsonify({'error': f'Extensión no permitida. Permitidas: {", ".join(sorted(ALLOWED_EXTENSIONS))}'}), 400

    directory = _get_dir(data_dir, usuario, tipo)
    if directory is None:
        return jsonify({'error': 'Parámetros inválidos'}), 400
    os.makedirs(directory, exist_ok=True)

    filename = secure_filename(f.filename)
    filepath = os.path.join(directory, filename)

    data = f.read()
    if len(data) > MAX_FILE_SIZE:
        return jsonify({'error': f'Archivo demasiado grande. Máximo {MAX_FILE_SIZE // (1024 * 1024)} MB'}), 413
    if len(data) == 0:
        return jsonify({'error': 'Archivo vacío'}), 400

    with open(filepath, 'wb') as fout:
        fout.write(data)
    stat = os.stat(filepath)
    logger.info(f'[Imagenes] Subida: usuario={usuario}, tipo={tipo}, archivo={filename}, tamaño={stat.st_size}')

    return jsonify({
        'ok': True,
        'usuario': usuario,
        'tipo': tipo,
        'nombre': filename,
        'tamano': stat.st_size,
    })


@imagenes_bp.route('/<usuario>/<tipo>/<nombre>', methods=['DELETE'])
@require_api_key
def eliminar(usuario, tipo, nombre):
    data_dir = current_app.config['DATA_DIR']

    safe_nombre = os.path.basename(nombre)

    directory = _get_dir(data_dir, usuario, tipo)
    if directory is None:
        return jsonify({'error': 'Parámetros inválidos (usuario o tipo inválido)'}), 400

    filepath = os.path.join(directory, safe_nombre)

    real_path = os.path.realpath(filepath)
    real_data = os.path.realpath(data_dir)
    if not real_path.startswith(real_data + os.sep):
        return jsonify({'error': 'Ruta no permitida'}), 403

    if not os.path.isfile(filepath):
        return jsonify({'error': 'Archivo no encontrado'}), 404

    tamano = os.stat(filepath).st_size
    os.remove(filepath)
    logger.info(f'[Imagenes] Eliminada: usuario={usuario}, tipo={tipo}, archivo={safe_nombre}')

    return jsonify({'ok': True, 'usuario': usuario, 'tipo': tipo, 'nombre': safe_nombre, 'tamano': tamano})
