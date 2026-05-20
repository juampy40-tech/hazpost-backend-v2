"""
HazPost — Website Scraper
=========================

Responsible for:
- Downloading website HTML
- Fetching website assets
- URL normalization
- Raw scraping

IMPORTANT:
- No AI logic here
- No branding interpretation
- No Flask routes
- No business logic
"""

from typing import Dict, Any


class WebsiteScraper:
    """
    Centralized website scraping service.
    """

    @staticmethod
    def scrape(url: str) -> Dict[str, Any]:
        """
        Main scraping entrypoint.

        Responsibilities:
        - Fetch HTML
        - Normalize URLs
        - Extract raw assets
        - Return normalized scraping payload
        """

        raise NotImplementedError(
            "Website scraping implementation pending migration."
        )
