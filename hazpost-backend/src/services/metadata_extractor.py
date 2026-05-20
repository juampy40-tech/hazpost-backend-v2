"""
HazPost — Metadata Extractor
============================

Responsible for:
- Meta tags extraction
- OpenGraph extraction
- Twitter cards extraction
- SEO metadata normalization

IMPORTANT:
- No AI logic here
- No Flask routes
- No business interpretation
"""

from typing import Dict, Any


class MetadataExtractor:
    """
    Centralized metadata extraction service.
    """

    @staticmethod
    def extract(html: str) -> Dict[str, Any]:
        """
        Extract normalized metadata payload.

        Responsibilities:
        - Titles
        - Descriptions
        - OpenGraph tags
        - Twitter cards
        - Canonical URLs
        """

        raise NotImplementedError(
            "Metadata extraction implementation pending migration."
        )
