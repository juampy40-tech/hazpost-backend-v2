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

        # Ignorar blanco/negro/grises demasiado neutros
        if r > 245 and g > 245 and b > 245:
            return False

        if r < 15 and g < 15 and b < 15:
            return False

        if abs(r - g) < 12 and abs(g - b) < 12 and abs(r - b) < 12:
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

                if hex_color not in palette:
                    palette.append(hex_color)

                if len(palette) >= 5:
                    break

            primary = palette[0] if palette else None
            secondary = palette[1] if len(palette) > 1 else "#FFFFFF"

            return {
                "success": bool(primary),
                "primaryColor": primary,
                "secondaryColor": secondary,
                "palette": palette,
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