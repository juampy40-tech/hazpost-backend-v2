import requests
from bs4 import BeautifulSoup
from typing import Any, Dict, Optional


class WebsiteAnalysisService:
    """
    Centralized service for website and brand analysis.
    """

    @staticmethod
    def scrape_website(website_url: str) -> Dict[str, Any]:
        """
        Basic website scraping MVP.
        """

        result = {
            "title": "",
            "meta_description": "",
            "headings": [],
            "paragraphs": [],
            "content": ""
        }

        try:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/122.0 Safari/537.36"
                )
            }

            response = requests.get(
                website_url,
                timeout=10,
                headers=headers
            )

            html = response.text

            soup = BeautifulSoup(html, "html.parser")

            title = soup.title.string.strip() if soup.title and soup.title.string else ""

            meta_description = ""

            meta_tag = soup.find("meta", attrs={"name": "description"})

            if meta_tag:
                meta_description = meta_tag.get("content", "").strip()

            headings = [
                h.get_text(strip=True)
                for h in soup.find_all(["h1", "h2"])[:10]
            ]

            paragraphs = [
                p.get_text(strip=True)
                for p in soup.find_all("p")[:10]
            ]

            content_parts = [
                title,
                meta_description,
                *headings,
                *paragraphs
            ]

            result = {
                "title": title,
                "meta_description": meta_description,
                "headings": headings,
                "paragraphs": paragraphs,
                "content": "\n".join(
                    part for part in content_parts if part
                )
            }

        except Exception:
            pass

        return result

    @staticmethod
    def analyze(
        website_url: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Main website analysis entrypoint.
        """

        scraped_data = WebsiteAnalysisService.scrape_website(
            website_url
        )

        return {
            "success": True,
            "scraped": scraped_data
        }