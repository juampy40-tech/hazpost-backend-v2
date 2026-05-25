"""
HazPost — AI Brand Analyzer
===========================

Responsible for:
- AI business understanding
- Tone analysis
- Audience detection
- Brand intelligence
- Content strategy suggestions

IMPORTANT:
- No Flask routes here
- No request/session usage
- No scraping logic here
- Consumes normalized website context only
"""

from typing import Dict, Any, Optional


class AIBrandAnalyzer:
    """
    Centralized AI brand analysis engine.
    """

    @staticmethod
    def build_brand_analysis_prompt(
        website: str,
        business: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Build centralized AI brand analysis prompt.

        IMPORTANT:
        - Form/onboarding data has priority over website text.
        - Website acts as visual/commercial support.
        - Prevent incorrect business reinterpretation.
        """

        context = context or {}
        
        website_content = (context.get("websiteContent") or "").strip()

        return f"""
Eres un experto en branding y marketing para negocios reales.

El formulario del usuario tiene PRIORIDAD sobre el website.

DATOS DEL NEGOCIO:
- Nombre: {context.get("companyName", business.get("companyName") or business.get("name") or "")}
- Industria: {context.get("industry") or business.get("industry") or ""}
- Subindustria: {context.get("subIndustry") or business.get("subIndustry") or ""}
- Slogan: {context.get("slogan") or business.get("slogan") or ""}
- Ciudad: {context.get("city") or business.get("city") or ""}
- País: {context.get("country") or business.get("country") or ""}
- Logo principal: {business.get("logoUrl") or ""}
- Logos adicionales: {business.get("logoUrls") or []}
- Imágenes referencia: {business.get("referenceImages") or []}
- Color primario actual: {business.get("primaryColor") or ""}
- Color secundario actual: {business.get("secondaryColor") or ""}

WEBSITE:
{website}

CONTENIDO REAL EXTRAÍDO DEL SITIO:
{website_content}

INSTRUCCIONES:
- Usa principalmente el contenido real extraído del sitio.
- Detecta qué vende realmente la empresa.
- Si faltan industria, subindustria, ciudad o país, infiérelos desde el website.
- NO uses placeholders como [Industria], [Subindustria], [Ciudad], [País] o similares.
- NO devuelvas frases genéricas.
- NO redefinas el negocio usando blogs o textos secundarios.
- NO conviertas el negocio en academia o cursos salvo que el sitio o formulario lo indiquen claramente.
- Si el sitio habla de alimentos, postres, tortas, helados, tradición, tecnología o experiencia, úsalo.
- El resultado debe sonar como una marca real, comercial y humana.
- Máximo 2-3 frases por campo.

Devuelve SOLO JSON válido:

{{
    "description": "...",
    "audienceDescription": "...",
    "brandTone": "...",
    "primaryColor": "#000000"
}}
"""

    @staticmethod
    def analyze(
        normalized_context: Dict[str, Any],
        extra_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate AI brand intelligence.

        Responsibilities:
        - business understanding
        - audience inference
        - tone detection
        - value proposition extraction
        - social media strategy hints
        - onboarding enrichment
        """

        raise NotImplementedError(
            "AI brand analyzer implementation pending migration."
        )
"""
HazPost — AI Brand Analyzer
===========================

Responsible for:
- AI business understanding
- Tone analysis
- Audience detection
- Brand intelligence
- Content strategy suggestions

IMPORTANT:
- No Flask routes here
- No request/session usage
- No scraping logic here
- Consumes normalized website context only
"""

from typing import Dict, Any, Optional


class AIBrandAnalyzer:
    """
    Centralized AI brand analysis engine.
    """

    @staticmethod
    def build_brand_analysis_prompt(
        website: str,
        business: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Build centralized AI brand analysis prompt.

        IMPORTANT:
        - Form/onboarding data has priority over website text.
        - Website acts as visual/commercial support.
        - Prevent incorrect business reinterpretation.
        """

        context = context or {}

        website_content = (context.get("websiteContent") or "").strip()

        return f"""
Eres un experto en branding y marketing para negocios reales.

El formulario del usuario tiene PRIORIDAD sobre el website.

DATOS DEL NEGOCIO:
- Nombre: {context.get("companyName") or business.get("companyName") or business.get("name") or ""}
- Industria: {context.get("industry") or business.get("industry") or ""}
- Subindustria: {context.get("subIndustry") or business.get("subIndustry") or ""}
- Slogan: {context.get("slogan") or business.get("slogan") or ""}
- Ciudad: {context.get("city") or business.get("city") or ""}
- País: {context.get("country") or business.get("country") or ""}
- Logo principal: {business.get("logoUrl") or ""}
- Logos adicionales: {business.get("logoUrls") or []}
- Imágenes referencia: {business.get("referenceImages") or []}
- Color primario actual: {business.get("primaryColor") or ""}
- Color secundario actual: {business.get("secondaryColor") or ""}

WEBSITE:
{website}

CONTENIDO REAL EXTRAÍDO DEL SITIO:
{website_content}

INSTRUCCIONES:
- Usa principalmente el contenido real extraído del sitio.
- Detecta qué vende realmente la empresa.
- Si faltan industria, subindustria, ciudad o país, infiérelos desde el website.
- NO uses placeholders como [Industria], [Subindustria], [Ciudad], [País] o similares.
- NO devuelvas frases genéricas.
- NO redefinas el negocio usando blogs o textos secundarios.
- NO conviertas el negocio en academia o cursos salvo que el sitio o formulario lo indiquen claramente.
- Si el sitio habla de alimentos, postres, tortas, helados, tradición, tecnología o experiencia, úsalo.
- El resultado debe sonar como una marca real, comercial y humana.
- Máximo 2-3 frases por campo.

Devuelve SOLO JSON válido:

{{
    "description": "...",
    "audienceDescription": "...",
    "brandTone": "...",
    "primaryColor": "#000000"
}}
"""

    @staticmethod
    def analyze(
        normalized_context: Dict[str, Any],
        extra_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Generate AI brand intelligence.

        Responsibilities:
        - business understanding
        - audience inference
        - tone detection
        - value proposition extraction
        - social media strategy hints
        - onboarding enrichment
        """

        raise NotImplementedError(
            "AI brand analyzer implementation pending migration."
        )