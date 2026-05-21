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

        return f"""
Eres un experto en branding y marketing para negocios reales.

El formulario del usuario tiene PRIORIDAD sobre el website.

DATOS DEL NEGOCIO:
- Nombre: {context.get("companyName", business.get("companyName") or business.get("name") or "")}
- Industria: {context.get("industry", business.get("industry") or "")}
- Subindustria: {context.get("subIndustry", business.get("subIndustry") or "")}
- Slogan: {context.get("slogan", "")}
- Ciudad: {context.get("city", business.get("city") or "")}
- País: {context.get("country", business.get("country") or "")}
- Logo principal: {business.get("logoUrl") or ""}
- Logos adicionales: {business.get("logoUrls") or []}
- Imágenes referencia: {business.get("referenceImages") or []}
- Color primario actual: {business.get("primaryColor") or ""}
- Color secundario actual: {business.get("secondaryColor") or ""}

WEBSITE:
{website}

INSTRUCCIONES:
- Usa el website SOLO como apoyo visual y comercial.
- NO redefinas el negocio usando blogs o textos secundarios.
- NO conviertas el negocio en academia o cursos salvo que el formulario lo indique.
- Prioriza industria, subindustria, slogan y nombre del negocio.
- Usa el website principalmente para:
  - colores
  - tono visual
  - productos visibles
  - estilo de marca

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

        return f"""
Eres un experto en branding y marketing para negocios reales.

El formulario del usuario tiene PRIORIDAD sobre el website.

DATOS DEL NEGOCIO:
- Nombre: {context.get("companyName", business.get("companyName") or business.get("name") or "")}
- Industria: {context.get("industry", business.get("industry") or "")}
- Subindustria: {context.get("subIndustry", business.get("subIndustry") or "")}
- Slogan: {context.get("slogan", "")}
- Ciudad: {context.get("city", business.get("city") or "")}
- País: {context.get("country", business.get("country") or "")}
- Logo principal: {business.get("logoUrl") or ""}
- Logos adicionales: {business.get("logoUrls") or []}
- Imágenes referencia: {business.get("referenceImages") or []}
- Color primario actual: {business.get("primaryColor") or ""}
- Color secundario actual: {business.get("secondaryColor") or ""}

WEBSITE:
{website}

INSTRUCCIONES:
- Usa el website SOLO como apoyo visual y comercial.
- NO redefinas el negocio usando blogs o textos secundarios.
- NO conviertas el negocio en academia o cursos salvo que el formulario lo indique.
- Prioriza industria, subindustria, slogan y nombre del negocio.
- Usa el website principalmente para:
  - colores
  - tono visual
  - productos visibles
  - estilo de marca

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