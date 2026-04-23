import os
from datetime import datetime
from flask import Blueprint, Response, current_app, render_template_string

seo_bp = Blueprint('seo', __name__)

SITE_PAGES = [
    {'path': '/', 'priority': '1.0', 'changefreq': 'daily'},
    {'path': '/pricing', 'priority': '0.9', 'changefreq': 'weekly'},
    {'path': '/features', 'priority': '0.9', 'changefreq': 'weekly'},
    {'path': '/about', 'priority': '0.7', 'changefreq': 'monthly'},
    {'path': '/blog', 'priority': '0.8', 'changefreq': 'daily'},
    {'path': '/login', 'priority': '0.5', 'changefreq': 'monthly'},
    {'path': '/signup', 'priority': '0.8', 'changefreq': 'monthly'},
]

SITEMAP_TEMPLATE = '''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
{% for page in pages %}
  <url>
    <loc>{{ base_url }}{{ page.path }}</loc>
    <lastmod>{{ today }}</lastmod>
    <changefreq>{{ page.changefreq }}</changefreq>
    <priority>{{ page.priority }}</priority>
  </url>
{% endfor %}
</urlset>'''

ROBOTS_TEMPLATE = '''User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /data/

Sitemap: {{ base_url }}/sitemap.xml
'''


@seo_bp.route('/sitemap.xml')
def sitemap():
    base_url = current_app.config.get('TARGET_SITE', 'https://hazpost.app').rstrip('/')
    today = datetime.utcnow().strftime('%Y-%m-%d')
    xml_content = render_template_string(SITEMAP_TEMPLATE, pages=SITE_PAGES, base_url=base_url, today=today)
    return Response(xml_content, mimetype='application/xml')


@seo_bp.route('/robots.txt')
def robots():
    base_url = current_app.config.get('TARGET_SITE', 'https://hazpost.app').rstrip('/')
    content = render_template_string(ROBOTS_TEMPLATE, base_url=base_url)
    return Response(content, mimetype='text/plain')


@seo_bp.route('/api/seo/meta')
def get_meta_tags():
    pages_meta = {}
    for page in SITE_PAGES:
        pages_meta[page['path']] = generate_meta_tags(page['path'])
    return pages_meta


def generate_meta_tags(path: str, title: str = None, description: str = None, image: str = None) -> dict:
    base_url = 'https://hazpost.app'
    defaults = {
        '/': {
            'title': 'HazPost — Gestión de Redes Sociales con IA',
            'description': 'Crea y programa contenido para tus redes sociales con inteligencia artificial. Ahorra tiempo, crece tu audiencia.',
            'image': f'{base_url}/static/og/home.jpg'
        },
        '/pricing': {
            'title': 'Planes y Precios — HazPost',
            'description': 'Elige el plan perfecto para tu negocio. Desde emprendedores hasta agencias.',
            'image': f'{base_url}/static/og/pricing.jpg'
        },
        '/features': {
            'title': 'Funcionalidades — HazPost',
            'description': 'Descubre todas las herramientas de IA que HazPost ofrece para tu estrategia de redes sociales.',
            'image': f'{base_url}/static/og/features.jpg'
        },
    }

    page_defaults = defaults.get(path, {
        'title': 'HazPost — Gestión de Redes Sociales con IA',
        'description': 'Plataforma de gestión de redes sociales impulsada por inteligencia artificial.',
        'image': f'{base_url}/static/og/default.jpg'
    })

    final_title = title or page_defaults['title']
    final_desc = description or page_defaults['description']
    final_image = image or page_defaults['image']
    canonical = f'{base_url}{path}'

    return {
        'title': final_title,
        'description': final_desc,
        'canonical': canonical,
        'og': {
            'title': final_title,
            'description': final_desc,
            'image': final_image,
            'url': canonical,
            'type': 'website',
            'site_name': 'HazPost'
        },
        'twitter': {
            'card': 'summary_large_image',
            'title': final_title,
            'description': final_desc,
            'image': final_image,
            'site': '@hazpost_app'
        }
    }
