"""
HazPost — Logo Detector
=======================

Responsible for:
- Logo discovery
- Favicon fallback
- Brand image prioritization
- Logo normalization

IMPORTANT:
- No AI logic here
- No Flask routes
- No DB access
- Only detection + normalization
"""

from typing import Dict, Any, List


class LogoDetector:
    """
    Centralized logo detection service.
    """

    @staticmethod
    def detect(html: str, base_url: str) -> Dict[str, Any]:
        """
        Detect possible brand logos from website HTML.

        Responsibilities:
        - img logo detection
        - favicon fallback
        - OpenGraph image fallback
        - SVG logo discovery
        - prioritize probable branding assets
        """

        raise NotImplementedError(
            "Logo detection implementation pending migration."
        )
