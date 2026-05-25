"""
HazPost — Color Extractor
=========================

Responsible for:
- Brand color extraction
- Dominant palette normalization
- HEX validation
- Color ranking

IMPORTANT:
- No AI logic here
- No Flask routes
- No DB access
- Only color extraction + normalization
"""

from io import BytesIO
from typing import Dict, Any, List, Tuple
from urllib.parse import urlparse
import colorsys

import requests
from PIL import Image


class ColorExtractor:
    """
    Centralized color extraction service.
    """

    @staticmethod
    def _rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
        return "#{:02X}{:02X}{:02X}".format(*rgb)

    @staticmethod
    def _is_brand_candidate(rgb: Tuple[int, int, int]) -> bool:
        r, g, b = rgb

        # Ignorar blancos
        if r > 245 and g > 245 and b > 245:
            return False

        # Ignorar negros
        if r < 20 and g < 20 and b < 20:
            return False

        # Ignorar grises/neutros
        if abs(r - g) < 18 and abs(g - b) < 18 and abs(r - b) < 18:
            return False

        # Ignorar azules UI típicos
        if b > 180 and r < 120 and g < 180:
            return False

        # Saturación REAL
        h, s, v = colorsys.rgb_to_hsv(
            r / 255,
            g / 255,
            b / 255,
        )

        # Ignorar colores lavados
        if s < 0.28:
            return False

        # Ignorar colores demasiado oscuros
        if v < 0.22:
            return False

        return True

    @staticmethod
    def _normalize_url(image_url: str) -> str:
        clean = (image_url or "").strip()

        if not clean:
            return ""

        parsed = urlparse(clean)

        if parsed.scheme in ("http", "https"):
            return clean.replace("http://", "https://")

        return clean

    @staticmethod
    def extract(image_url: str) -> Dict[str, Any]:
        """
        Extract dominant brand colors from image/logo.

        Responsibilities:
        - dominant colors
        - primary color
        - secondary color
        - palette normalization
        - HEX sanitization
        """

        url = ColorExtractor._normalize_url(image_url)

        if not url:
            return {
                "success": False,
                "primaryColor": None,
                "secondaryColor": None,
                "palette": [],
                "source": "logo",
                "error": "empty_image_url",
            }

        try:
            response = requests.get(
                url,
                timeout=10,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/122.0 Safari/537.36"
                    )
                },
            )
            response.raise_for_status()

            image = Image.open(BytesIO(response.content)).convert("RGBA")
            image.thumbnail((180, 180))

            pixels = list(image.getdata())
            counts: Dict[Tuple[int, int, int], int] = {}

            for r, g, b, a in pixels:
                # Ignorar transparencia real
                if a < 180:
                    continue

                # Reducir ruido agrupando colores similares
                bucket = (
                    int(round(r / 16) * 16),
                    int(round(g / 16) * 16),
                    int(round(b / 16) * 16),
                )

                bucket = tuple(max(0, min(255, value)) for value in bucket)

                if not ColorExtractor._is_brand_candidate(bucket):
                    continue

                counts[bucket] = counts.get(bucket, 0) + 1

            ranked = sorted(
                counts.items(),
                key=lambda item: item[1],
                reverse=True,
            )

            palette: List[str] = []
            for rgb, _count in ranked:
                hex_color = ColorExtractor._rgb_to_hex(rgb)

                # Evitar colores demasiado parecidos en la paleta
                is_too_similar = False
                for existing_hex in palette:
                    existing_rgb = tuple(
                        int(existing_hex[i:i + 2], 16)
                        for i in (1, 3, 5)
                    )

                    distance = sum(
                        abs(rgb[index] - existing_rgb[index])
                        for index in range(3)
                    )

                    if distance < 80:
                        is_too_similar = True
                        break

                if not is_too_similar:
                    palette.append(hex_color)

                if len(palette) >= 5:
                    break

            primary = palette[0] if palette else None
            secondary = palette[1] if len(palette) > 1 else None

            confidence = "low"

            if len(palette) >= 3:
                confidence = "high"
            elif len(palette) >= 1:
                confidence = "medium"

            return {
                "success": bool(primary),
                "primaryColor": primary,
                "secondaryColor": secondary,
                "palette": palette,
                "confidence": confidence,
                "source": "logo",
            }

        except Exception as error:
            return {
                "success": False,
                "primaryColor": None,
                "secondaryColor": None,
                "palette": [],
                "source": "logo",
                "error": str(error),
            }