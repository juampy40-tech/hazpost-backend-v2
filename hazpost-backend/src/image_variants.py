import json
import os
import time
import uuid
import logging
import base64
from io import BytesIO
from urllib.parse import urlparse

import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps, UnidentifiedImageError


logger = logging.getLogger(__name__)

ALLOWED_IMAGE_HOSTS = {
    "pub-86d30a989fe64bc1b60fd7511bd1a5f2.r2.dev",
}

ALLOWED_IMAGE_SCHEMES = {"https"}

MAX_IMAGE_DOWNLOAD_BYTES = 12 * 1024 * 1024  # 12 MB
IMAGE_DOWNLOAD_TIMEOUT = 12
OUTPUT_IMAGE_QUALITY = 92

def _is_allowed_image_url(url):
    if not isinstance(url, str) or not url.strip():
        return False

    try:
        parsed = urlparse(url.strip())
    except Exception:
        return False

    if parsed.scheme not in ALLOWED_IMAGE_SCHEMES:
        return False

    if parsed.hostname not in ALLOWED_IMAGE_HOSTS:
        return False

    return True


def _download_image_from_url(url):
    if not _is_allowed_image_url(url):
        raise ValueError("URL de imagen no permitida para render visual")

    response = requests.get(
        url,
        timeout=IMAGE_DOWNLOAD_TIMEOUT,
        stream=True,
        headers={"User-Agent": "HazPost-ImageRenderer/1.0"},
    )
    response.raise_for_status()

    content_type = (response.headers.get("Content-Type") or "").lower()
    if not content_type.startswith("image/"):
        raise ValueError("La URL no devuelve una imagen válida")

    content_length = response.headers.get("Content-Length")
    if content_length and int(content_length) > MAX_IMAGE_DOWNLOAD_BYTES:
        raise ValueError("Imagen demasiado grande para render visual")

    buffer = BytesIO()
    downloaded = 0

    for chunk in response.iter_content(chunk_size=8192):
        if not chunk:
            continue

        downloaded += len(chunk)
        if downloaded > MAX_IMAGE_DOWNLOAD_BYTES:
            raise ValueError("Imagen excede el límite permitido")

        buffer.write(chunk)

    buffer.seek(0)

    try:
        image = Image.open(buffer)
        image.verify()
    except UnidentifiedImageError:
        raise ValueError("Formato de imagen no reconocido")

    buffer.seek(0)
    image = Image.open(buffer).convert("RGBA")

    return ImageOps.exif_transpose(image)


def normalize_post_data(post_data):
    if isinstance(post_data, str):
        try:
            post_data = json.loads(post_data)
        except Exception:
            post_data = {}

    if not isinstance(post_data, dict):
        post_data = {}

    return post_data


def normalize_variants(post_data, post_id=None):
    post_data = normalize_post_data(post_data)

    variants = post_data.get("imageVariants") or post_data.get("image_variants") or []

    if not isinstance(variants, list):
        variants = []

    image_url = post_data.get("imageUrl") or post_data.get("image_url") or ""

    if not variants and image_url:
        variants = [{
            "id": post_id or str(uuid.uuid4()),
            "postId": post_id,
            "imageUrl": image_url,
            "imageData": "",
            "rawBackground": image_url,
            "rawBackgroundUrl": image_url,
            "generationStatus": "completed",
            "style": "default",
            "variantIndex": 0,
            "overlayParams": post_data.get("overlayParams") or {},
            "createdAt": int(time.time() * 1000),
        }]

    clean = []
    for index, variant in enumerate(variants):
        if not isinstance(variant, dict):
            continue

        image_url = (
            variant.get("imageUrl")
            or variant.get("image_url")
            or variant.get("imageData")
            or variant.get("rawBackground")
            or variant.get("rawBackgroundUrl")
            or ""
        )

        clean.append({
            **variant,
            "id": variant.get("id") or str(uuid.uuid4()),
            "postId": variant.get("postId") or post_id,
            "imageUrl": image_url,
            "imageData": variant.get("imageData") or "",
            "rawBackground": variant.get("rawBackground") or variant.get("rawBackgroundUrl") or image_url,
            "rawBackgroundUrl": variant.get("rawBackgroundUrl") or variant.get("rawBackground") or image_url,
            "generationStatus": variant.get("generationStatus") or "completed",
            "style": variant.get("style") or "default",
            "variantIndex": variant.get("variantIndex", index),
            "overlayParams": variant.get("overlayParams") or {},
            "createdAt": variant.get("createdAt") or int(time.time() * 1000),
        })

    clean.sort(key=lambda v: v.get("variantIndex", 0))

    post_data["imageVariants"] = clean

    if clean and not post_data.get("imageUrl"):
        post_data["imageUrl"] = clean[0].get("imageUrl") or clean[0].get("imageData")

    return clean, post_data


def find_variant(post_data, variant_id, post_id=None):
    variants, post_data = normalize_variants(post_data, post_id=post_id)

    target = str(variant_id)

    for variant in variants:
        if str(variant.get("id")) == target:
            return variant, variants, post_data

    return None, variants, post_data


def _safe_headline_text(text, max_length=120):
    if not isinstance(text, str):
        return ""

    text = text.strip()

    if not text:
        return ""

    text = " ".join(text.split())

    return text[:max_length]


def _load_default_font(size=42):
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf", size=size)
    except Exception:
        return ImageFont.load_default()


def _render_basic_overlay(image, overlay_params=None):
    overlay_params = overlay_params or {}

    headline = _safe_headline_text(
        overlay_params.get("headline")
        or overlay_params.get("title")
        or ""
    )

    if not headline:
        return image

    canvas = image.copy().convert("RGBA")

    width, height = canvas.size

    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    gradient_height = int(height * 0.28)

    draw.rectangle(
        [(0, height - gradient_height), (width, height)],
        fill=(0, 0, 0, 150),
    )

    font = _load_default_font(
        max(28, int(width * 0.045))
    )

    text_x = int(width * 0.06)
    text_y = height - gradient_height + int(height * 0.05)

    draw.text(
        (text_x, text_y),
        headline,
        font=font,
        fill=(255, 255, 255, 255),
    )

    return Image.alpha_composite(canvas, overlay)


def _image_to_jpeg_bytes(image):
    if image is None:
        return None

    output = BytesIO()

    rgb_image = image.convert("RGB")

    rgb_image.save(
        output,
        format="JPEG",
        quality=OUTPUT_IMAGE_QUALITY,
        optimize=True,
    )

    output.seek(0)
    return output


def create_overlay_variant(post_data, post_id, source_variant_id=None, overlay_params=None):
    overlay_params = overlay_params or {}

    source_variant, variants, post_data = find_variant(
        post_data,
        source_variant_id or post_id,
        post_id=post_id
    )

    if not source_variant and variants:
        source_variant = variants[0]

    if not source_variant:
        raise ValueError("No hay imagen base para crear variante")

    base_image = (
        source_variant.get("rawBackgroundUrl")
        or source_variant.get("rawBackground")
        or source_variant.get("imageUrl")
        or source_variant.get("imageData")
        or post_data.get("imageUrl")
        or post_data.get("image_url")
        or ""
    )

    if not base_image:
        raise ValueError("La imagen base no tiene URL o data válida")

    next_index = len(variants)

    rendered_image = None
    rendered_base64 = ""

    try:
        downloaded_image = _download_image_from_url(base_image)

        rendered_image = _render_basic_overlay(
            downloaded_image,
            overlay_params=overlay_params,
        )

        rendered_bytes = _image_to_jpeg_bytes(rendered_image)

        if rendered_bytes:
            rendered_base64 = base64.b64encode(
                rendered_bytes.getvalue()
            ).decode("utf-8")

    except Exception as render_error:
        logger.exception(
            "Error renderizando overlay variant post_id=%s: %s",
            post_id,
            render_error,
        )
    
    new_variant = {
        "id": str(uuid.uuid4()),
        "postId": post_id,
        "imageUrl": base_image,
        "imageData": rendered_base64 if rendered_image else "",
        "rawBackground": base_image,
        "rawBackgroundUrl": base_image,
        "generationStatus": "completed",
        "style": overlay_params.get("style") or source_variant.get("style") or "default",
        "variantIndex": next_index,
        "overlayParams": {
            **(source_variant.get("overlayParams") or {}),
            **overlay_params,
        },
        "createdAt": int(time.time() * 1000),
        "sourceVariantId": source_variant.get("id"),
        "isOverlayVariant": True,
        "needsRender": True,
    }

    variants.append(new_variant)

    post_data["imageVariants"] = variants
    post_data["selectedImageVariant"] = new_variant["id"]

    # Por ahora apunta a la nueva variante. Luego aquí irá la composición real.
    post_data["imageUrl"] = (
        f"data:image/jpeg;base64,{rendered_base64}"
        if rendered_base64
        else new_variant["imageUrl"]
    )

    return new_variant, post_data


def select_variant(post_data, variant_id, post_id=None):
    variant, variants, post_data = find_variant(post_data, variant_id, post_id=post_id)

    if not variant:
        raise ValueError("Variante no encontrada")

    post_data["selectedImageVariant"] = variant.get("id")
    post_data["imageUrl"] = variant.get("imageUrl") or variant.get("imageData") or post_data.get("imageUrl")

    return variant, post_data


def delete_variant(post_data, variant_id, post_id=None):
    variants, post_data = normalize_variants(post_data, post_id=post_id)

    target = str(variant_id)
    remaining = [v for v in variants if str(v.get("id")) != target]

    if len(remaining) == len(variants):
        raise ValueError("Variante no encontrada")

    for index, variant in enumerate(remaining):
        variant["variantIndex"] = index

    post_data["imageVariants"] = remaining

    if str(post_data.get("selectedImageVariant")) == target:
        post_data["selectedImageVariant"] = remaining[0].get("id") if remaining else None
        post_data["imageUrl"] = remaining[0].get("imageUrl") if remaining else post_data.get("imageUrl")

    return post_data


def reorder_variants(post_data, variant_ids, post_id=None):
    variants, post_data = normalize_variants(post_data, post_id=post_id)

    order_map = {str(vid): index for index, vid in enumerate(variant_ids)}

    for variant in variants:
        if str(variant.get("id")) in order_map:
            variant["variantIndex"] = order_map[str(variant.get("id"))]

    variants.sort(key=lambda v: v.get("variantIndex", 0))
    post_data["imageVariants"] = variants

    return variants, post_data
