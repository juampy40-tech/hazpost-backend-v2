"""
HazPost — Website Analysis Service
==================================

Source of truth for:
- Website scraping
- Branding extraction
- AI website analysis
- Context normalization
- Brand intelligence generation

IMPORTANT:
- Do NOT place Flask routes here.
- Do NOT use request/session objects here.
- Keep this service reusable and centralized.
- Both onboarding and business analysis endpoints must consume this service.

Architecture goals:
- Single AI analysis engine
- Shared prompt strategy
- Shared scraping strategy
- Shared normalization
- Prevent duplicated AI logic across endpoints
"""

from typing import Any, Dict, Optional


class WebsiteAnalysisService:
    """
    Centralized service for website and brand analysis.
    """

    @staticmethod
    def analyze(
        website_url: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Main website analysis entrypoint.

        IMPORTANT:
        Real implementation will be migrated progressively from:
        - /api/analyze-website
        - /api/businesses/<id>/analyze-website

        This method will become the single source of truth.
        """

        raise NotImplementedError(
            "Website analysis implementation pending migration."
        )
