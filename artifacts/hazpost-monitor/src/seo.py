import json
import os
from datetime import datetime, timezone
from pathlib import Path

TARGET_URL = os.getenv("TARGET_URL", "https://hazpost.app")
MONITOR_BASE_URL = os.getenv("MONITOR_BASE_URL", "https://monitor.hazpost.app")
DATA_FILE = Path("data/skills_auto.json")

SITE_NAME = "HazPost Monitor"
SITE_DESCRIPTION = "Sistema automático de monitoreo 24/7 para hazpost.app — skills, alertas, SEO y backups."


def _load_skills() -> list[str]:
    if DATA_FILE.exists():
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("skills", [])
    return []


def get_meta_tags(page: str = "home") -> dict:
    skills = _load_skills()
    keywords = ", ".join(skills[:15]) if skills else "hazpost, monitor, skills, alertas"

    titles = {
        "home": f"{SITE_NAME} — Monitor 24/7",
        "skills": f"Skills Detectados — {SITE_NAME}",
    }
    descriptions = {
        "home": SITE_DESCRIPTION,
        "skills": f"Listado actualizado de {len(skills)} skills detectados automáticamente en hazpost.app.",
    }

    base_url = MONITOR_BASE_URL.rstrip("/")
    page_url = base_url if page == "home" else f"{base_url}/{page}"

    return {
        "title": titles.get(page, SITE_NAME),
        "description": descriptions.get(page, SITE_DESCRIPTION),
        "keywords": keywords,
        "og_title": titles.get(page, SITE_NAME),
        "og_description": descriptions.get(page, SITE_DESCRIPTION),
        "og_url": page_url,
        "og_type": "website",
        "og_site_name": SITE_NAME,
        "twitter_card": "summary",
        "twitter_title": titles.get(page, SITE_NAME),
        "twitter_description": descriptions.get(page, SITE_DESCRIPTION),
        "canonical": page_url,
        "json_ld": _get_json_ld(page, skills),
    }


def _get_json_ld(page: str, skills: list[str]) -> dict:
    base = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": SITE_NAME,
        "description": SITE_DESCRIPTION,
        "url": MONITOR_BASE_URL.rstrip("/"),
    }
    if page == "skills" and skills:
        base["@type"] = "ItemList"
        base["itemListElement"] = [
            {"@type": "ListItem", "position": i + 1, "name": s}
            for i, s in enumerate(skills[:20])
        ]
    return base


def generate_sitemap() -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pages = [
        ("", "1.0", "daily"),
        ("skills", "0.9", "hourly"),
    ]
    base = MONITOR_BASE_URL.rstrip("/")
    urls = ""
    for path, priority, freq in pages:
        loc = f"{base}/{path}".rstrip("/") or base
        urls += (
            f"  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <lastmod>{now}</lastmod>\n"
            f"    <changefreq>{freq}</changefreq>\n"
            f"    <priority>{priority}</priority>\n"
            f"  </url>\n"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}"
        "</urlset>"
    )


def generate_robots() -> str:
    return (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /api/\n"
        "Disallow: /backups/\n"
        f"Sitemap: {MONITOR_BASE_URL.rstrip('/')}/sitemap.xml\n"
    )
