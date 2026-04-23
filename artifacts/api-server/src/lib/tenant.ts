import { eq, and, or, isNull, isNotNull, inArray, sql, count } from "drizzle-orm";
import type { Column, SQL } from "drizzle-orm";
import { db, contentHistoryTable, businessesTable, imageVariantsTable, postsTable } from "@workspace/db";
import type { Request } from "express";
import { subIndustryToSlug } from "./industries.js";

// ─── Tenant Isolation Utilities ───────────────────────────────────────────────
//
// REGLAS DE USO OBLIGATORIO:
// 1. Toda ruta que lee datos de usuario DEBE llamar tenantFilterCol() — nunca inline.
// 2. Todo query a content_history DEBE usar contentHistoryScope() o contentHistoryScopeSafe().
// 3. Toda operación con businessId externo DEBE usar requireBusinessOwnership().
// 4. PATRÓN FAIL-CLOSED: cuando no hay userId/businessId, retornar vacío — nunca datos globales.
//
// Anti-patrón prohibido en Drizzle:
//   const cond = userId != null ? eq(table.userId, userId) : undefined;
//   .where(and(..., cond))  ← cond=undefined es IGNORADO por Drizzle → expone datos de todos los usuarios
//
// Patrón correcto:
//   if (userId == null) return [];  // fail-closed — retornar vacío, no datos globales
//   .where(contentHistoryScope(userId, businessId))

/**
 * Returns a tenant-scoped WHERE expression for any table column that maps to userId.
 * Admin role → undefined (admin sees all — only use in explicitly admin-only routes).
 * Regular user → eq(col, userId).
 *
 * Usage:
 *   const tf = tenantFilterCol(postsTable.userId, req);
 *   const rows = await db.select().from(postsTable)
 *     .where(tf ? and(eq(postsTable.id, id), tf) : eq(postsTable.id, id));
 */
export function tenantFilterCol(col: Column, req: Request): ReturnType<typeof eq> | undefined {
  if (req.user!.role === "admin") return undefined;
  return eq(col, req.user!.userId);
}

/**
 * Strict owner-only filter — SIN admin bypass.
 *
 * Úsalo en recursos EXCLUSIVOS donde ningún usuario puede ver datos de otro,
 * ni siquiera el admin usando rutas de usuario.
 *
 * Recursos que usan este filtro: media_library, business_elements.
 * Los posts/niches/analytics usan tenantFilterCol (con admin bypass intencional).
 *
 * Si se pasan bizIdCol y businessId, filtra por userId AND businessId.
 * Si solo se pasa userIdCol, filtra únicamente por userId.
 *
 * @param userIdCol  Columna userId de la tabla
 * @param req        Express request (con req.user autenticado)
 * @param bizIdCol   Columna businessId de la tabla (opcional)
 * @param businessId businessId activo — requerido si bizIdCol se usa
 */
export function strictOwnerFilter(
  userIdCol: Column,
  req: Request,
  bizIdCol?: Column,
  businessId?: number | null,
): SQL {
  const uid = req.user!.userId;
  if (bizIdCol && businessId != null) {
    return and(eq(userIdCol, uid), eq(bizIdCol, businessId))!;
  }
  return eq(userIdCol, uid);
}

/**
 * Tenant filter for image_variants when JOINed with postsTable.
 * Handles legacy rows where image_variants.user_id was NULL — identifies through postsTable.user_id.
 * Admin → undefined (sees all).
 */
export function tenantFilterVariantsJoined(req: Request): SQL | undefined {
  if (req.user!.role === "admin") return undefined;
  const uid = req.user!.userId;
  return or(
    eq(imageVariantsTable.userId, uid),
    and(isNull(imageVariantsTable.userId), eq(postsTable.userId, uid)),
  );
}

/**
 * Tenant filter for image_variants when postsTable is NOT in the query.
 * Uses a subquery to resolve legacy rows where image_variants.user_id was NULL.
 * Admin → undefined (sees all).
 */
export function tenantFilterVariants(req: Request): SQL | undefined {
  if (req.user!.role === "admin") return undefined;
  const uid = req.user!.userId;
  const ownedPostIds = db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(eq(postsTable.userId, uid));
  return or(
    eq(imageVariantsTable.userId, uid),
    and(isNull(imageVariantsTable.userId), inArray(imageVariantsTable.postId, ownedPostIds)),
  );
}

/**
 * Builds the WHERE clause for content_history queries — FAIL-CLOSED pattern.
 * Prioritizes businessId (per-business isolation), falls back to userId.
 * THROWS if both are null/undefined — prevents global data leak.
 *
 * Use for: getRecentHooks, topic deduplication, any per-user content_history query.
 */
export function contentHistoryScope(
  userId: number | undefined,
  businessId: number | undefined
): ReturnType<typeof eq> {
  if (businessId != null) return eq(contentHistoryTable.businessId, businessId);
  if (userId != null) return eq(contentHistoryTable.userId, userId);
  throw new Error(
    "[tenant] contentHistoryScope: userId o businessId requerido — " +
    "previniendo fuga global de datos de content_history"
  );
}

/**
 * Fail-safe version of contentHistoryScope. Returns null when both are undefined.
 * Callers MUST handle null by returning an empty result — never by omitting the filter.
 *
 * Use for: background-job queries where having no userId is a valid edge case.
 */
export function contentHistoryScopeSafe(
  userId: number | undefined,
  businessId: number | undefined
): ReturnType<typeof eq> | null {
  if (businessId != null) return eq(contentHistoryTable.businessId, businessId);
  if (userId != null) return eq(contentHistoryTable.userId, userId);
  return null;
}

/**
 * Async library filter para la Biblioteca de Fondos.
 * Aplica aislamiento estricto por negocio activo e industria.
 *
 * N1 — Fondos propios del negocio activo:
 *   image_variants.business_id = activeBizId
 *   (Fondos sin businessId quedan excluidos — son imágenes huérfanas de pruebas de admin)
 *   Fail-closed si no hay negocio activo: devuelve set vacío (sql`1 = 0`) — NUNCA mezcla
 *   fondos de distintos negocios del mismo usuario. La biblioteca muestra 0 resultados.
 *
 * N2 — Misma industria de otros usuarios:
 *   industry_group_slug = mySlug AND user_id != uid
 *   (Solo si el negocio activo tiene industryGroupSlug asignado)
 *
 * Fondos sin industryGroupSlug o de industria diferente → NO visibles para otros usuarios.
 *
 * @param req Express request (con req.user autenticado)
 * @param businessId ID del negocio activo (opcional — si se omite, usa el negocio default del usuario)
 */
export async function tenantLibraryFilter(req: Request, businessId?: number): Promise<SQL> {
  const uid = req.user!.userId;
  const isAdmin = req.user!.role === "admin";

  const bizCond = businessId != null
    ? and(
        eq(businessesTable.id, businessId),
        isAdmin ? undefined : eq(businessesTable.userId, uid)
      )
    : and(eq(businessesTable.userId, uid), eq(businessesTable.isDefault, true));

  const [activeBiz] = await db
    .select({ id: businessesTable.id, industryGroupSlug: businessesTable.industryGroupSlug, subIndustry: businessesTable.subIndustry, country: businessesTable.country })
    .from(businessesTable)
    .where(bizCond!)
    .limit(1);

  const mySlug            = activeBiz?.industryGroupSlug ?? null;
  const activeBizId       = activeBiz?.id ?? null;
  const mySubIndustrySlug = subIndustryToSlug(activeBiz?.subIndustry ?? null);
  const myCountry         = activeBiz?.country ?? null;

  // N1: solo imágenes del negocio activo.
  // Fondos con businessId=NULL son huérfanos (generados sin contexto de negocio) → excluidos.
  // Fail-closed: si activeBizId es null (negocio no determinado), set vacío — NUNCA mezcla
  // fondos de distintos negocios del mismo usuario. La biblioteca queda vacía, no contaminada.
  const ownFilter: SQL = activeBizId != null
    ? eq(imageVariantsTable.businessId, activeBizId)
    : sql`1 = 0`;

  // ── Fail-closed: sin industria o sin país → solo fondos propios (N1 únicamente) ──
  // Garantiza que:
  // (a) negocios del mismo país no se vean entre sí en ninguna circunstancia.
  // (b) negocios sin industria asignada no ven fondos de ningún otro usuario.
  // El usuario configura su país en Configuración para activar N2.
  if (!mySlug || !myCountry) return ownFilter;

  // ── Conditional 2-tier cross-tenant N2 ───────────────────────────────────
  // N2 SIEMPRE requiere: misma industria + country != myCountry + country IS NOT NULL.
  // NO HAY Tier 3 universal — si ningún tier tiene resultados, devolvemos solo fondos propios.
  // Esto garantiza que tenantLibraryFilter y tenantLibraryAccessFilter sean semánticamente
  // idénticos para los criterios de N2 (misma industria, diferente país).
  //
  // Tier 1: sub-industry exact match (most precise)
  // Tier 2: industry-group match (fallback when no sub-industry results)
  // Fallback: ownFilter (no cross-tenant exposure if neither tier has results)

  // Visibility predicate — must mirror the list endpoint's filter (rawBackground IS NOT NULL).
  const visible = isNotNull(imageVariantsTable.rawBackground);

  // Predicate: different country, country must be set (no country → invisible para N2)
  const diffCountry = and(
    isNotNull(imageVariantsTable.country),
    sql`${imageVariantsTable.country} != ${myCountry}`,
  )!;

  // Probe Tier 1: sub-industry exact matches from other users, different country (visible rows only)
  if (mySubIndustrySlug) {
    const [{ value: subCount }] = await db
      .select({ value: count() })
      .from(imageVariantsTable)
      .where(and(
        visible,
        eq(imageVariantsTable.subIndustrySlug, mySubIndustrySlug),
        sql`${imageVariantsTable.userId} != ${uid}`,
        diffCountry,
      ));
    if (subCount > 0) {
      return or(
        ownFilter,
        and(
          eq(imageVariantsTable.subIndustrySlug, mySubIndustrySlug),
          sql`${imageVariantsTable.userId} != ${uid}`,
          diffCountry,
        )!,
      )!;
    }
  }

  // Probe Tier 2: industry-group matches from other users, different country (visible rows only)
  const [{ value: industryCount }] = await db
    .select({ value: count() })
    .from(imageVariantsTable)
    .where(and(
      visible,
      eq(imageVariantsTable.industryGroupSlug, mySlug),
      sql`${imageVariantsTable.userId} != ${uid}`,
      diffCountry,
    ));
  if (industryCount > 0) {
    return or(
      ownFilter,
      and(
        eq(imageVariantsTable.industryGroupSlug, mySlug),
        sql`${imageVariantsTable.userId} != ${uid}`,
        diffCountry,
      )!,
    )!;
  }

  // Sin resultados en ningún tier → solo fondos propios (fail-closed, sin exposición cross-tenant)
  return ownFilter;
}

/**
 * Permissive library access filter for individual image access (thumb, raw, detail).
 *
 * N1 — ANY image owned by this user (userId = uid), regardless of which business generated it.
 *   This is intentionally permissive: the strict businessId-scope is only needed in the LIST
 *   endpoint to prevent N1 contamination between the user's own businesses. For thumbnail/raw
 *   access, blocking a user's own image because it belongs to a non-default business is wrong.
 *
 * N2 — Same industry group from other users.
 *   Uses the user's default business slug for the industry match (best-effort).
 *   If the user has no default business with a slug, only N1 is returned.
 *
 * Use for: GET /backgrounds/:id/thumb, GET /backgrounds/:id/raw, GET /backgrounds/:id
 * Do NOT use for: GET /backgrounds (list) — that uses tenantLibraryFilter() with strict businessId scope.
 */
export async function tenantLibraryAccessFilter(req: Request): Promise<SQL> {
  const uid = req.user!.userId;

  // N1: any image this user owns — three cases handle all legacy variants:
  //   a) userId matches directly
  //   b) userId=NULL but postId belongs to user's posts (legacy: generated with post context)
  //   c) userId=NULL, postId=NULL but businessId belongs to user's businesses (legacy: no post context)
  const ownedPostIds = db
    .select({ id: postsTable.id })
    .from(postsTable)
    .where(eq(postsTable.userId, uid));
  const userBizIds = db
    .select({ id: businessesTable.id })
    .from(businessesTable)
    .where(eq(businessesTable.userId, uid));
  const ownFilter: SQL = or(
    eq(imageVariantsTable.userId, uid),
    and(isNull(imageVariantsTable.userId), inArray(imageVariantsTable.postId, ownedPostIds)),
    and(isNull(imageVariantsTable.userId), inArray(imageVariantsTable.businessId, userBizIds)),
  )!;

  // Resolve user's default business to determine industry slug and country for N2
  const [defaultBiz] = await db
    .select({ industryGroupSlug: businessesTable.industryGroupSlug, country: businessesTable.country })
    .from(businessesTable)
    .where(and(eq(businessesTable.userId, uid), eq(businessesTable.isDefault, true)))
    .limit(1);

  const mySlug    = defaultBiz?.industryGroupSlug ?? null;
  const myCountry = defaultBiz?.country ?? null;

  // Fail-closed: sin industria o sin país → solo fondos propios
  if (!mySlug || !myCountry) return ownFilter;

  // N2: same industry from other users, DIFFERENT country (country must be set)
  const crossFilter = and(
    eq(imageVariantsTable.industryGroupSlug, mySlug),
    isNotNull(imageVariantsTable.industryGroupSlug),
    sql`${imageVariantsTable.userId} != ${uid}`,
    isNotNull(imageVariantsTable.country),
    sql`${imageVariantsTable.country} != ${myCountry}`,
  )!;

  return or(ownFilter, crossFilter)!;
}

/**
 * Verifies that businessId belongs to userId. Returns the business record if valid.
 * Returns null if businessId doesn't exist or doesn't belong to userId.
 * Admin users bypass ownership check (sees all businesses).
 *
 * Use in any route that receives a businessId from body/params before operating on it.
 */
export async function requireBusinessOwnership(
  businessId: number,
  userId: number,
  isAdmin = false
): Promise<typeof businessesTable.$inferSelect | null> {
  const [biz] = await db
    .select()
    .from(businessesTable)
    .where(
      isAdmin
        ? eq(businessesTable.id, businessId)
        : and(eq(businessesTable.id, businessId), eq(businessesTable.userId, userId))
    )
    .limit(1);
  return biz ?? null;
}
