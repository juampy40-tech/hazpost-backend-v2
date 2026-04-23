import { Router } from "express";
import { db } from "@workspace/db";
import { contentTemplatesTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { INDUSTRY_CATALOG } from "../../lib/industries.js";

const router = Router();

const DEFAULT_TEMPLATES = [
  {
    industrySlug: "restaurante", industryName: "Restaurante & Comida",
    title: "Plato del día", description: "Destaca el plato estrella de hoy con apetitosa descripción",
    postType: "image", tone: "cercano",
    suggestedTopic: "Nuestro plato del día: una experiencia llena de sabor y frescura que no te puedes perder",
    hashtags: "#Plato #ComidaDelDía #Restaurante #Sabor", sortOrder: 0,
  },
  {
    industrySlug: "restaurante", industryName: "Restaurante & Comida",
    title: "Proceso de preparación", description: "Muestra cómo se prepara un platillo con video corto",
    postType: "reel", tone: "educativo",
    suggestedTopic: "El proceso detrás de nuestro plato estrella: ingredientes frescos, técnica y pasión en cada paso",
    hashtags: "#CocinaEnVivo #Receta #Chef #Gastronomia", sortOrder: 1,
  },
  {
    industrySlug: "restaurante", industryName: "Restaurante & Comida",
    title: "Menú de la semana", description: "Presenta los platos disponibles esta semana en formato carrusel",
    postType: "carousel", tone: "informativo",
    suggestedTopic: "Descubre nuestro menú de la semana: variedad, frescura y precios que te van a encantar",
    hashtags: "#Menú #Gastronomia #ComidaCasera #Nutrición", sortOrder: 2,
  },

  {
    industrySlug: "salud", industryName: "Salud & Bienestar",
    title: "Consejo de salud diario", description: "Comparte un tip de salud útil y sencillo de aplicar",
    postType: "image", tone: "educativo",
    suggestedTopic: "Un consejo de salud que puedes aplicar hoy mismo para mejorar tu bienestar y energía diaria",
    hashtags: "#SaludMental #Bienestar #TipsDeVida #Salud", sortOrder: 0,
  },
  {
    industrySlug: "salud", industryName: "Salud & Bienestar",
    title: "Testimonio de paciente", description: "Historia de transformación de un cliente satisfecho",
    postType: "reel", tone: "inspiracional",
    suggestedTopic: "La historia de uno de nuestros pacientes: cómo mejoró su calidad de vida con nuestro acompañamiento",
    hashtags: "#Testimonio #TransformaciónSalud #Bienestar #Salud", sortOrder: 1,
  },
  {
    industrySlug: "salud", industryName: "Salud & Bienestar",
    title: "Servicios disponibles", description: "Presenta todos los servicios en formato visual y organizado",
    postType: "carousel", tone: "profesional",
    suggestedTopic: "Todos los servicios que ofrecemos para cuidar tu salud: especialistas, tratamientos y atención personalizada",
    hashtags: "#Servicios #Salud #CuidadoPersonal #Bienestar", sortOrder: 2,
  },

  {
    industrySlug: "estetica", industryName: "Belleza & Estética",
    title: "Antes y después", description: "Muestra una transformación real de un cliente",
    postType: "carousel", tone: "inspiracional",
    suggestedTopic: "Mira esta increíble transformación: el trabajo que hacemos con dedicación y profesionalismo habla solo",
    hashtags: "#AntesYDespues #Belleza #Transformación #Estetica", sortOrder: 0,
  },
  {
    industrySlug: "estetica", industryName: "Belleza & Estética",
    title: "Tutorial de técnica", description: "Enseña una técnica o proceso de belleza en video",
    postType: "reel", tone: "educativo",
    suggestedTopic: "Te mostramos paso a paso cómo realizamos este tratamiento de belleza para que veas nuestra técnica y cuidado",
    hashtags: "#Tutorial #Belleza #Técnica #Estética", sortOrder: 1,
  },
  {
    industrySlug: "estetica", industryName: "Belleza & Estética",
    title: "Servicios y precios", description: "Lista de servicios con precios y beneficios destacados",
    postType: "image", tone: "informativo",
    suggestedTopic: "Nuestros servicios de belleza con los mejores precios del mercado: calidad garantizada en cada tratamiento",
    hashtags: "#Precios #Servicios #Belleza #Estética", sortOrder: 2,
  },

  {
    industrySlug: "educacion", industryName: "Educación",
    title: "Tip de aprendizaje", description: "Comparte un consejo práctico para mejorar el estudio",
    postType: "image", tone: "motivacional",
    suggestedTopic: "Un consejo de estudio que puede cambiar tu rendimiento académico: sencillo, práctico y efectivo",
    hashtags: "#Educación #TipsDeEstudio #Aprendizaje #Estudiantes", sortOrder: 0,
  },
  {
    industrySlug: "educacion", industryName: "Educación",
    title: "Clase demo", description: "Video corto mostrando una muestra de la metodología de enseñanza",
    postType: "reel", tone: "educativo",
    suggestedTopic: "Así es como aprendemos en nuestra academia: metodología dinámica, participativa y enfocada en resultados",
    hashtags: "#ClaseDemo #Educación #Aprendizaje #Academia", sortOrder: 1,
  },
  {
    industrySlug: "educacion", industryName: "Educación",
    title: "Plan de estudios", description: "Presenta el contenido del curso o programa en formato carrusel",
    postType: "carousel", tone: "informativo",
    suggestedTopic: "Todo lo que aprenderás en nuestro programa: contenidos, horas de estudio, certificación y más",
    hashtags: "#PlanDeEstudios #Cursos #Formación #Educación", sortOrder: 2,
  },

  {
    industrySlug: "gym", industryName: "Fitness & Deporte",
    title: "Ejercicio del día", description: "Muestra un ejercicio con su técnica correcta y beneficios",
    postType: "reel", tone: "motivacional",
    suggestedTopic: "El ejercicio del día: técnica correcta, músculos que trabaja y cuántas repeticiones hacer para mejores resultados",
    hashtags: "#Ejercicio #Fitness #Gym #Entrenamiento", sortOrder: 0,
  },
  {
    industrySlug: "gym", industryName: "Fitness & Deporte",
    title: "Transformación física", description: "Historia de un miembro con su proceso de transformación",
    postType: "carousel", tone: "inspiracional",
    suggestedTopic: "La transformación de uno de nuestros miembros: constancia, disciplina y el acompañamiento correcto hacen la diferencia",
    hashtags: "#Transformación #Fitness #Motivación #Gym", sortOrder: 1,
  },
  {
    industrySlug: "gym", industryName: "Fitness & Deporte",
    title: "Membresías y horarios", description: "Presenta los planes disponibles y los horarios de clases",
    postType: "image", tone: "informativo",
    suggestedTopic: "Conoce nuestras membresías y horarios: encuentra el plan perfecto para alcanzar tus metas fitness",
    hashtags: "#Membresía #Horarios #Gym #Fitness", sortOrder: 2,
  },

  {
    industrySlug: "moda", industryName: "Moda & Ropa",
    title: "Look del día", description: "Muestra una combinación de outfit inspiradora con los productos disponibles",
    postType: "image", tone: "cercano",
    suggestedTopic: "Inspírate con este look de hoy: combinaciones únicas con piezas exclusivas de nuestra colección",
    hashtags: "#LookDelDía #Moda #Outfit #Estilo", sortOrder: 0,
  },
  {
    industrySlug: "moda", industryName: "Moda & Ropa",
    title: "Lookbook nueva colección", description: "Presentación visual de los nuevos lanzamientos en carrusel",
    postType: "carousel", tone: "inspiracional",
    suggestedTopic: "Nuestra nueva colección ya está disponible: piezas únicas con materiales de calidad y diseño exclusivo",
    hashtags: "#NuevaColección #Lookbook #Moda #Fashion", sortOrder: 1,
  },
  {
    industrySlug: "moda", industryName: "Moda & Ropa",
    title: "Cómo combinarlo", description: "Video de styling mostrando cómo usar una prenda de múltiples formas",
    postType: "reel", tone: "educativo",
    suggestedTopic: "¿Cómo combinar esta prenda de 3 formas diferentes? Mira este video y descubre todo su potencial en tu guardarropa",
    hashtags: "#Styling #Outfit #Moda #ComoUsarlo", sortOrder: 2,
  },
];

async function seedIfEmpty() {
  const count = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentTemplatesTable);
  if (Number(count[0]?.count) === 0) {
    await db.insert(contentTemplatesTable).values(DEFAULT_TEMPLATES.map(t => ({ ...t, isActive: true })));
    logger.info("content_templates: seeded with default templates");
  }
}

/** GET /api/admin/content-templates — list all (including inactive) */
router.get("/", async (_req, res) => {
  try {
    await seedIfEmpty();
    const templates = await db
      .select()
      .from(contentTemplatesTable)
      .orderBy(asc(contentTemplatesTable.industrySlug), asc(contentTemplatesTable.sortOrder), asc(contentTemplatesTable.id));
    const industries = INDUSTRY_CATALOG.map(e => ({ slug: e.slug, name: e.name }));
    res.json({ templates, industries });
  } catch (err) {
    logger.error({ err }, "Error al listar plantillas de contenido");
    res.status(500).json({ error: "Error al obtener plantillas" });
  }
});

/** POST /api/admin/content-templates — create */
router.post("/", async (req, res) => {
  try {
    const body = req.body as {
      industrySlug: string; industryName: string; title: string; description?: string;
      postType?: string; tone?: string; suggestedTopic?: string; hashtags?: string;
      isActive?: boolean; sortOrder?: number;
    };
    if (!body.industrySlug || !body.industryName || !body.title) {
      return res.status(400).json({ error: "industrySlug, industryName y title son requeridos" });
    }
    const [created] = await db.insert(contentTemplatesTable).values({
      industrySlug: body.industrySlug,
      industryName: body.industryName,
      title: body.title,
      description: body.description ?? "",
      postType: body.postType ?? "image",
      tone: body.tone ?? "",
      suggestedTopic: body.suggestedTopic ?? "",
      hashtags: body.hashtags ?? "",
      isActive: body.isActive ?? true,
      sortOrder: body.sortOrder ?? 0,
    }).returning();
    res.status(201).json({ template: created });
  } catch (err) {
    logger.error({ err }, "Error al crear plantilla de contenido");
    res.status(500).json({ error: "Error al crear plantilla" });
  }
});

/** PUT /api/admin/content-templates/:id — update */
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const body = req.body as Partial<{
      industrySlug: string; industryName: string; title: string; description: string;
      postType: string; tone: string; suggestedTopic: string; hashtags: string;
      isActive: boolean; sortOrder: number;
    }>;
    const [updated] = await db
      .update(contentTemplatesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(contentTemplatesTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Plantilla no encontrada" });
    res.json({ template: updated });
  } catch (err) {
    logger.error({ err }, "Error al actualizar plantilla de contenido");
    res.status(500).json({ error: "Error al actualizar plantilla" });
  }
});

/** DELETE /api/admin/content-templates/:id — delete */
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });
    const [deleted] = await db
      .delete(contentTemplatesTable)
      .where(eq(contentTemplatesTable.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Plantilla no encontrada" });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error al eliminar plantilla de contenido");
    res.status(500).json({ error: "Error al eliminar plantilla" });
  }
});

export default router;
