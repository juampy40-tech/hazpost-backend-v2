import json
import os
import time
import uuid
import logging
import base64
import boto3
from werkzeug.utils
import secure_filename
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

# ============================================================
# R2 STORAGE
# ============================================================

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
    return "overlay-variants"


def _upload_rendered_variant_to_r2(rendered_bytes):
    if not rendered_bytes or not _r2_ready():
        return None

    try:
        r2 = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT_URL,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        )

        file_id = str(uuid.uuid4())
        filename = f"{file_id}.jpg"

        user_key = _get_user_key()

        object_key = f"overlay-variants/{user_key}/{filename}"

        r2.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=object_key,
            Body=rendered_bytes.getvalue(),
            ContentType="image/jpeg",
        )

        public_url = _r2_public_url(object_key)

        logger.info(f"✅ Overlay variant subida a R2: {public_url}")

        return public_url

    except Exception as e:
        logger.exception(f"❌ Error subiendo overlay variant a R2: {e}")
        return None

# ============================================================
# VISUAL ENGINE PRO — Fuentes, tamaños y colores seguros
# ============================================================

FONT_CATALOG = {
    "montserrat": {
        "file": "Montserrat-Bold.ttf",
        "scale": 1.0,
        "label": "Montserrat",
        "category": "clean",
    },
    "montserrat-bold": {
        "file": "Montserrat-Bold.ttf",
        "scale": 1.0,
        "label": "Montserrat Bold",
        "category": "clean",
    },
    "montserrat-extrabold": {
        "file": "Montserrat-ExtraBold.ttf",
        "scale": 0.96,
        "label": "Montserrat ExtraBold",
        "category": "bold",
    },
    "montserrat-black": {
        "file": "Montserrat-Black.ttf",
        "scale": 0.92,
        "label": "Montserrat Black",
        "category": "bold",
    },
    "bebas": {
        "file": "BebasNeue-Regular.ttf",
        "scale": 1.0,
        "label": "Bebas Neue",
        "category": "cinematic",
    },
    "bungee": {
        "file": "Bungee-Regular.ttf",
        "scale": 0.80,
        "label": "Bungee",
        "category": "viral",
    },
    "anton": {
        "file": "Anton-Regular.ttf",
        "scale": 0.82,
        "label": "Anton",
        "category": "impact",
    },
}

SIZE_SCALE = {
    "small": 0.052,
    "s": 0.052,
    "sm": 0.065,
    "medium": 0.080,
    "m": 0.080,
    "large": 0.105,
    "l": 0.105,
    "xl": 0.125,
}

DEFAULT_FONT_KEY = "montserrat"
DEFAULT_TEXT_SIZE = "medium"

# ============================================================
# SAFE ZONES — Protección visual universal
# ============================================================

TEXT_SAFE_TOP_RATIO = 0.05
TEXT_SAFE_BOTTOM_RATIO = 0.94

FOOTER_RESERVED_RATIO = 0.035
# ============================================================
# STYLE ENGINE — Presets visuales inteligentes
# ============================================================

STYLE_PRESETS = {
    "classic": {
        "shadow_opacity": 150,
        "stroke_scale": 0.0011,
        "overlay_alpha": 115,
        "line_style": "none",
        "line_thickness": 0.003,
        "text_spacing": 0.016,
        "signature_spacing": 0.026,
    },
    "cinema": {
        "shadow_opacity": 210,
        "stroke_scale": 0.0017,
        "overlay_alpha": 160,
        "line_style": "elegant",
        "line_thickness": 0.004,
        "text_spacing": 0.020,
        "signature_spacing": 0.034,
    },
    "editorial": {
        "shadow_opacity": 100,
        "stroke_scale": 0.0008,
        "overlay_alpha": 90,
        "line_style": "minimal",
        "line_thickness": 0.002,
        "text_spacing": 0.024,
        "signature_spacing": 0.038,
    },
    "neon": {
        "shadow_opacity": 255,
        "stroke_scale": 0.0015,
        "overlay_alpha": 145,
        "line_style": "glow",
        "line_thickness": 0.004,
        "text_spacing": 0.019,
        "signature_spacing": 0.032,
    },
    "block": {
        "shadow_opacity": 230,
        "stroke_scale": 0.0021,
        "overlay_alpha": 175,
        "line_style": "bold",
        "line_thickness": 0.006,
        "text_spacing": 0.015,
        "signature_spacing": 0.026,
    },
    "viral": {
        "shadow_opacity": 245,
        "stroke_scale": 0.0024,
        "overlay_alpha": 185,
        "line_style": "bold",
        "line_thickness": 0.006,
        "text_spacing": 0.014,
        "signature_spacing": 0.026,
    },
    "authority": {
        "shadow_opacity": 130,
        "stroke_scale": 0.0010,
        "overlay_alpha": 105,
        "line_style": "minimal",
        "line_thickness": 0.002,
        "text_spacing": 0.023,
        "signature_spacing": 0.038,
    },
    "conversion": {
        "shadow_opacity": 220,
        "stroke_scale": 0.0019,
        "overlay_alpha": 165,
        "line_style": "elegant",
        "line_thickness": 0.005,
        "text_spacing": 0.017,
        "signature_spacing": 0.030,
    },
}

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


def _load_default_font(size=42, font_key=None):
    current_dir = os.path.dirname(os.path.abspath(__file__))

    font_config = FONT_CATALOG.get(
        str(font_key or DEFAULT_FONT_KEY).lower(),
        FONT_CATALOG[DEFAULT_FONT_KEY],
    )

    selected_font = font_config["file"]

    font_candidates = [
        os.path.join(current_dir, "assets", "fonts", selected_font),
        os.path.join(current_dir, "assets", "fonts", "Montserrat-Bold.ttf"),
        os.path.join(current_dir, "assets", "fonts", "Montserrat-VariableFont_wght.ttf"),
        "DejaVuSans-Bold.ttf",
    ]

    for font_path in font_candidates:
        try:
            if os.path.exists(font_path) or font_path == "DejaVuSans-Bold.ttf":
                logger.info(f"✅ Fuente cargada: {font_path}")
                return ImageFont.truetype(font_path, size=size)
        except Exception as e:
            logger.warning(f"⚠️ Error cargando fuente {font_path}: {e}")
            continue

    logger.warning("❌ No se pudo cargar ninguna fuente TTF.")
    return ImageFont.load_default()

    
def _render_basic_overlay(image, overlay_params=None):
    overlay_params = overlay_params or {}

    headline = _safe_headline_text(
        overlay_params.get("headline")
        or overlay_params.get("title")
        or overlay_params.get("customHeadline")
        or overlay_params.get("customTitle")
        or "",
        max_length=140,
    )

    logger.info(f"🔥 overlay_params={overlay_params}")

    signature_text = _safe_headline_text(
        overlay_params.get("signatureText") or "",
        max_length=70,
    )

    show_signature = overlay_params.get("showSignature", True)
    text_position = overlay_params.get("textPosition") or "bottom"

    if not headline and not signature_text:
        return image

    canvas = image.copy().convert("RGBA")
    width, height = canvas.size

    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))

    # draw para overlay/transparencias
    overlay_draw = ImageDraw.Draw(overlay)

    # draw REAL para texto comercial
    draw = ImageDraw.Draw(canvas)

    # Área visual comercial
    band_height = int(height * 0.28)

    if text_position == "top":
        band_top = 0
        band_bottom = min(height, band_height)
    elif text_position == "center":
        band_top = max(0, int((height - band_height) / 2))
        band_bottom = min(height, band_top + band_height)
    else:
        band_bottom = height
        band_top = max(0, height - band_height)

    # Degradado oscuro fuerte pero elegante
    steps = max(1, band_bottom - band_top)
    for i in range(steps):
        ratio = i / steps
        alpha = int(18 + (120 * ratio)) if text_position == "bottom" else 150
        y = band_top + i
        overlay_draw.line([(0, y), (width, y)], fill=(0, 0, 0, alpha))

    padding_x = int(width * 0.07)

    selected_font_key = str(
        overlay_params.get("overlayFont")
        or overlay_params.get("fontFamily")
        or DEFAULT_FONT_KEY
    ).strip().lower()

    selected_text_size = str(
        overlay_params.get("textSize")
        or DEFAULT_TEXT_SIZE
    ).strip().lower()

    size_ratio = SIZE_SCALE.get(selected_text_size, SIZE_SCALE[DEFAULT_TEXT_SIZE])

    font_config = FONT_CATALOG.get(
        selected_font_key,
        FONT_CATALOG[DEFAULT_FONT_KEY],
    )

    font_scale = font_config.get("scale", 1.0)

    headline_font_size = max(
        42,
        int(width * size_ratio * font_scale)
    )

    accent_font_size = max(
        46,
        int(width * (size_ratio * 1.08) * font_scale)
    )

    signature_font_size = max(
        24,
        int(width * (size_ratio * 0.42))
    )
    headline_font = _load_default_font(
        headline_font_size,
        font_key=selected_font_key,
    )

    accent_font = _load_default_font(
        accent_font_size,
        font_key=selected_font_key,
    )

    signature_font = _load_default_font(
        signature_font_size,
        font_key=selected_font_key,
    )
    
    def _hex_to_rgba(value, fallback=(255, 255, 255, 255)):
        if not isinstance(value, str):
            return fallback

        value = value.strip()

        if not value.startswith("#"):
            return fallback

        value = value.lstrip("#")

        if len(value) == 3:
            value = "".join([char * 2 for char in value])

        if len(value) != 6:
            return fallback

        try:
            r = int(value[0:2], 16)
            g = int(value[2:4], 16)
            b = int(value[4:6], 16)
            return (r, g, b, 255)
        except Exception:
            return fallback

    primary_text_color = _hex_to_rgba(
        overlay_params.get("titleColor2"),
        fallback=(255, 255, 255, 255),
    )

    accent_text_color = _hex_to_rgba(
        overlay_params.get("titleColor1"),
        fallback=(0, 198, 255, 255),
    )

    signature_color = _hex_to_rgba(
        overlay_params.get("signatureColor") or overlay_params.get("titleColor2"),
        fallback=(255, 255, 255, 255),
    )

    shadow = (0, 0, 0, 190)

    selected_style = str(
        overlay_params.get("textStyle")
        or "classic"
    ).strip().lower()

    import random

    layout_mode = overlay_params.get("layoutMode")

    if not layout_mode:
        layout_mode = random.choice([
            "hero",
            "cinema",
            "editorial",
            "split",
            "magazine",
            "impact",
        ])

    style_config = STYLE_PRESETS.get(
        selected_style,
        STYLE_PRESETS["classic"],
    )

    shadow_opacity = style_config["shadow_opacity"]

    overlay_alpha = style_config["overlay_alpha"]

    stroke_scale = style_config["stroke_scale"]

    text_spacing_scale = style_config["text_spacing"]

    signature_spacing_scale = style_config["signature_spacing"]

    line_style = style_config["line_style"]

    line_thickness = style_config["line_thickness"]

    shadow = (0, 0, 0, shadow_opacity)

    def _fit_lines(text, font, max_width, max_lines=3):
        words = text.split()
        lines = []
        current = ""

        for word in words:
            test = f"{current} {word}".strip()
            bbox = draw.textbbox((0, 0), test, font=font)
            test_width = bbox[2] - bbox[0]

            if test_width <= max_width:
                current = test
            else:
                if current:
                    lines.append(current)
                current = word

        if current:
            lines.append(current)

        return lines[:max_lines]

    lines = _fit_lines(
        headline.upper(),
        headline_font,
        int(width * 0.72),
        max_lines=3,
    )

    # Regla visual por defecto:
    # 1 línea  = acento
    # 2 líneas = principal + acento
    # 3 líneas = principal + acento + principal
    line_color_plan = []

    if len(lines) == 0:
        line_color_plan = []
    elif len(lines) == 1:
        line_color_plan = [(lines[0], accent_text_color)]
    elif len(lines) == 2:
        line_color_plan = [
            (lines[0], primary_text_color),
            (lines[1], accent_text_color),
        ]
    else:
        line_color_plan = [
            (lines[0], primary_text_color),
            (lines[1], accent_text_color),
            (lines[2], primary_text_color),
        ]
        
    line_gap = int(height * text_spacing_scale)
    signature_gap = int(height * signature_spacing_scale)

    total_text_height = 0

    for line, _line_color in line_color_plan:
        bbox = draw.textbbox((0, 0), line, font=headline_font)
        total_text_height += (bbox[3] - bbox[1]) + line_gap

    if show_signature and signature_text:
        bbox = draw.textbbox((0, 0), signature_text.upper(), font=signature_font)
        total_text_height += signature_gap + (bbox[3] - bbox[1])

    # 🔥 posición más premium y menos pegada abajo
    # ============================================================
    # POSITION ENGINE — Arriba / Centro / Abajo REAL
    # ============================================================

    if text_position == "top":
        current_y = band_top + int(height * 0.035)

    elif text_position == "center":
        current_y = int(
            ((band_top + band_bottom) / 2)
            - (total_text_height / 2)
        )

    else:
        current_y = (
            band_bottom
            - total_text_height
            - int(height * 0.035)
        )

    # ============================================================
    # SAFE ZONES APPLY
    # ============================================================

    TEXT_SAFE_TOP = int(height * TEXT_SAFE_TOP_RATIO)
    TEXT_SAFE_BOTTOM = int(height * TEXT_SAFE_BOTTOM_RATIO)

    footer_reserved_height = int(height * FOOTER_RESERVED_RATIO)

    max_allowed_y = (
        TEXT_SAFE_BOTTOM
        - footer_reserved_height
        - total_text_height
    )

    current_y = max(current_y, TEXT_SAFE_TOP)
    current_y = min(current_y, max_allowed_y)

    def _center_x(text, font):
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        return int((width - text_w) / 2)

    def _draw_pro_text(text, font, y, fill):
        x = _center_x(text, font)

        # sombra grande
        draw.text((x + 2, y + 2), text, font=font, fill=shadow)

        # stroke / borde
        stroke_w = max(1, int(width * stroke_scale))
        draw.text(
            (x, y),
            text,
            font=font,
            fill=fill,
            stroke_width=stroke_w,
            stroke_fill=(0, 0, 0, 210),
        )

        bbox = draw.textbbox((0, 0), text, font=font)
        return y + (bbox[3] - bbox[1]) + line_gap

    for line, line_color in line_color_plan:
        current_y = _draw_pro_text(line, headline_font, current_y, line_color)

    if show_signature and signature_text:
        current_y += signature_gap

        sig = signature_text.upper()
        sig_x = _center_x(sig, signature_font)

        draw.text(
            (sig_x + 1, current_y + 1),
            sig,
            font=signature_font,
            fill=(0, 0, 0, 230),
        )

        draw.text(
            (sig_x, current_y),
            sig,
            font=signature_font,
            fill=signature_color,
            stroke_width=max(2, int(width * 0.0025)),
            stroke_fill=(0, 0, 0, 210),
        )

        # líneas decorativas inteligentes:
        # respetan firma, margen y color de acento
        sig_bbox = draw.textbbox((0, 0), sig, font=signature_font)
        sig_w = sig_bbox[2] - sig_bbox[0]
        sig_h = sig_bbox[3] - sig_bbox[1]

        line_h = max(3, int(height * 0.004))
        line_gap_x = int(width * 0.035)
        min_line_w = int(width * 0.06)
        max_line_w = int(width * 0.16)

        line_y = current_y + int(sig_h * 0.52)

        left_line_end = sig_x - line_gap_x
        left_line_start = max(padding_x, left_line_end - max_line_w)

        right_line_start = sig_x + sig_w + line_gap_x
        right_line_end = min(width - padding_x, right_line_start + max_line_w)

        left_line_w = left_line_end - left_line_start
        right_line_w = right_line_end - right_line_start

        if left_line_w >= min_line_w:
            draw.rounded_rectangle(
                [(left_line_start, line_y), (left_line_end, line_y + line_h)],
                radius=line_h,
                fill=accent_text_color,
            )

        if right_line_w >= min_line_w:
            draw.rounded_rectangle(
                [(right_line_start, line_y), (right_line_end, line_y + line_h)],
                radius=line_h,
                fill=accent_text_color,
            )
    canvas = Image.alpha_composite(canvas, overlay)

    return canvas


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
    rendered_public_url = None

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

            rendered_public_url = _upload_rendered_variant_to_r2(
                rendered_bytes
            )

    except Exception as render_error:
        logger.exception(
            "Error renderizando overlay variant post_id=%s: %s",
            post_id,
            render_error,
        )
    
    new_variant = {
        "id": str(uuid.uuid4()),
        "postId": post_id,
        "imageUrl": (
            rendered_public_url
            or f"data:image/jpeg;base64,{rendered_base64}"
            if rendered_base64
            else base_image
        ),
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
    post_data["imageUrl"] = (
        f"data:image/jpeg;base64,{variant.get('imageData')}"
        if variant.get("imageData")
        else variant.get("imageUrl")
        or post_data.get("imageUrl")
    )

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
