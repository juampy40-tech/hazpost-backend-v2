import os
import uuid
import requests
import logging

from flask import Blueprint, request, jsonify, session
from werkzeug.utils import secure_filename

import replicate

logger = logging.getLogger(__name__)

image_generation_bp = Blueprint("image_generation", __name__)

REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")

# 🔥 REUTILIZAMOS TU CONFIG R2
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")


def _r2_ready():
    return all([
        R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY,
        R2_ENDPOINT_URL,
        R2_BUCKET_NAME,
        R2_PUBLIC_URL,
    ])


def _r2_public_url(object_key: str) -> str:
    return f"{R2_PUBLIC_URL.rstrip('/')}/{object_key.lstrip('/')}"


def _get_user_key():
    user = session.get("user") or {}
    return secure_filename(str(user.get("email") or "anonymous"))


@image_generation_bp.route("/api/generate-image", methods=["POST"])
def generate_image():
    try:
        if not REPLICATE_API_TOKEN:
            return jsonify({
                "success": False,
                "error": "REPLICATE_API_TOKEN no configurado"
            }), 500

        data = request.get_json(silent=True) or {}
        prompt = data.get("prompt")

        if not prompt:
            return jsonify({
                "success": False,
                "error": "Prompt requerido"
            }), 400

        # ====================================================
        # 🧠 GENERAR IMAGEN CON FLUX
        # ====================================================
        logger.info(f"Generando imagen con prompt: {prompt}")

        output = replicate.run(
            "black-forest-labs/flux-schnell",
            input={
                "prompt": prompt,
                "num_outputs": 1,
                "aspect_ratio": "1:1",
                "output_format": "jpg"
            }
        )

        if not output:
            raise Exception("Replicate no devolvió imagen")

        image_url = output[0]

        # ====================================================
        # 📥 DESCARGAR IMAGEN
        # ====================================================
        response = requests.get(image_url)

        if response.status_code != 200:
            raise Exception("Error descargando imagen")

        image_bytes = response.content

        # ====================================================
        # ☁️ SUBIR A R2
        # ====================================================
        if not _r2_ready():
            raise Exception("R2 no configurado")

        import boto3

        r2 = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT_URL,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        )

        file_id = str(uuid.uuid4())
        filename = f"{file_id}.jpg"

        user_key = _get_user_key()
        object_key = f"generated/{user_key}/{filename}"

        r2.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=object_key,
            Body=image_bytes,
            ContentType="image/jpeg"
        )

        public_url = _r2_public_url(object_key)

        logger.info(f"Imagen subida a R2: {public_url}")

        return jsonify({
            "success": True,
            "imageUrl": public_url,
            "source": "replicate_flux"
        })

    except Exception as e:
        logger.exception(f"GENERATE IMAGE ERROR: {e}")
        return jsonify({
            "success": False,
            "error": "Error generando imagen"
        }), 500
