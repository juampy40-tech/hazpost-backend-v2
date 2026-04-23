import { useGetPosts } from "@workspace/api-client-react";
import { useActiveBusiness } from "@/contexts/ActiveBusinessContext";

/**
 * Hook centralizado que SIEMPRE inyecta businessId del negocio activo.
 *
 * REGLA DE ARQUITECTURA — skill: business-selector-rules
 * Usar en lugar de useGetPosts en TODA la web.
 * NUNCA llamar useGetPosts directamente desde páginas — el aislamiento
 * por negocio se pierde y posts de otros negocios se mezclan en la vista.
 *
 * Uso:
 *   const { data: posts } = useBusinessPosts({ status: 'pending_approval', slim: '1' });
 *
 * Garantías de aislamiento (V-QUERY):
 * 1. La query está DESHABILITADA hasta que el contexto de negocio activo haya
 *    cargado completamente (loaded=true). Esto garantiza que nunca se hace
 *    una request al backend sin businessId definido.
 * 2. Mientras loaded=false, el hook retorna isLoading:true y data:undefined
 *    para que los consumidores muestren el spinner y nunca hagan flash del estado vacío.
 */
export function useBusinessPosts(params: Parameters<typeof useGetPosts>[0] = {}) {
  const { id: businessId, loaded } = useActiveBusiness();
  const result = useGetPosts(
    { ...params, ...(businessId != null ? { businessId: String(businessId) } : {}) },
    { query: { enabled: loaded } },
  );

  // V-QUERY: When business context hasn't loaded yet, TanStack Query v5 sets
  // isLoading=false (idle/disabled state). Override to isLoading=true so consumers
  // reliably show their loading skeleton and never flash an empty state.
  if (!loaded) {
    return { ...result, isLoading: true as const, data: undefined };
  }

  return result;
}
