import { Router } from "express";
import { db } from "@workspace/db";
import { contentTemplatesTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

/** GET /api/content-templates?industrySlug=<slug>
 *  Returns active templates, optionally filtered by industry slug.
 *  Public: no auth required (used in onboarding and generate page). */
router.get("/", async (req, res) => {
  try {
    const { industrySlug, industryName } = req.query as {
      industrySlug?: string;
      industryName?: string;
    };

    const conditions = [eq(contentTemplatesTable.isActive, true)];
    if (industrySlug) {
      conditions.push(eq(contentTemplatesTable.industrySlug, industrySlug));
    } else if (industryName) {
      conditions.push(eq(contentTemplatesTable.industryName, industryName));
    }

    const templates = await db
      .select()
      .from(contentTemplatesTable)
      .where(and(...conditions))
      .orderBy(
        asc(contentTemplatesTable.industrySlug),
        asc(contentTemplatesTable.sortOrder),
        asc(contentTemplatesTable.id)
      );

    res.json({ templates });
  } catch (err) {
    logger.error({ err }, "Error al obtener plantillas de contenido");
    res.status(500).json({ error: "Error al obtener plantillas" });
  }
});

export default router;
