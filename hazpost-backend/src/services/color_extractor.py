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

from typing import Dict, Any, List


class ColorExtractor:
    """
    Centralized color extraction service.
    """

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

        raise NotImplementedError(
            "Color extraction implementation pending migration."
        )
