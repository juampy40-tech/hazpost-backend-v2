/**
 * Catálogo estático de industrias (nivel 1) y sub-industrias (nivel 2).
 * Fuente de verdad para el frontend, el endpoint GET /api/industries y el AI prompt.
 *
 * Reglas:
 * - El nombre de la industria DEBE coincidir con los valores aceptados por el campo `industry` en businesses.
 * - El nombre de la sub-industria es el valor guardado en `sub_industry` en businesses.
 * - Los slugs se derivan automáticamente para usarse en el matching de biblioteca de fondos.
 * - aiContext (opcional): contexto pre-definido que la IA usa para generar posts más relevantes.
 *   Al agregar una industria nueva, agregar su aiContext para mejorar la calidad de los posts.
 */

export interface IndustrySubcategory {
  name: string;
  slug: string;
}

export interface IndustryAiContext {
  description: string;
  content_topics: string[];
  recommended_tone: string;
  audience: string;
  content_formats: string[];
  keywords: string[];
}

export interface IndustryCatalogEntry {
  name: string;
  slug: string;
  subcategories: IndustrySubcategory[];
  aiContext?: IndustryAiContext;
}

export const INDUSTRY_CATALOG: IndustryCatalogEntry[] = [
  {
    name: "Restaurante & Comida",
    slug: "restaurante",
    subcategories: [
      { name: "Restaurante Colombiano", slug: "restaurante-colombiano" },
      { name: "Pizzería",               slug: "pizzeria" },
      { name: "Sushi & Japonés",        slug: "sushi-japones" },
      { name: "Cafetería",              slug: "cafeteria" },
      { name: "Panadería & Pastelería", slug: "panaderia-pasteleria" },
      { name: "Heladería",              slug: "heladeria" },
      { name: "Comida Rápida",          slug: "comida-rapida" },
      { name: "Comida Saludable",       slug: "comida-saludable" },
      { name: "Comida Vegana & Plant-based", slug: "comida-vegana" },
      { name: "Charcutería & Deli",     slug: "charcuteria-deli" },
      { name: "Repostería & Tortas",    slug: "reposteria-tortas" },
    ],
    aiContext: {
      description: "Restaurantes, cafeterías, panaderías, heladerías y todo tipo de negocios de alimentación que buscan atraer clientes con contenido apetitoso y cercano.",
      content_topics: [
        "Platos del día y menús especiales con fotos apetitosas",
        "Proceso de preparación detrás de escena",
        "Historia y pasión del chef o fundador",
        "Ingredientes frescos y de temporada",
        "Promociones especiales: 2x1, combos, descuentos",
        "Experiencia del cliente: ambiente, sabor, servicio",
        "Recetas rápidas o tips de cocina",
        "Celebraciones y fechas especiales: cumpleaños, San Valentín",
      ],
      recommended_tone: "cálido, apetitoso y cercano",
      audience: "familias, parejas y personas que buscan dónde comer o pedir a domicilio",
      content_formats: ["foto de plato con descripción", "reel del proceso de preparación", "carousel de menú semanal", "story de promoción del día"],
      keywords: ["gastronomía", "sabor", "delicioso", "menú", "chef", "comida casera", "pedidos", "domicilio"],
    },
  },
  {
    name: "Salud & Bienestar",
    slug: "salud",
    subcategories: [
      { name: "Medicina General",  slug: "medicina-general" },
      { name: "Psicología",        slug: "psicologia" },
      { name: "Veterinaria",       slug: "veterinaria" },
      { name: "Odontología",       slug: "odontologia" },
      { name: "Fisioterapia",      slug: "fisioterapia" },
      { name: "Nutrición",         slug: "nutricion" },
      { name: "Óptica",            slug: "optica" },
      { name: "Farmacia",          slug: "farmacia" },
    ],
  },
  {
    name: "Salud Mental & Coaching",
    slug: "coaching",
    subcategories: [
      { name: "Coach de Vida",           slug: "coach-vida" },
      { name: "Terapeuta",               slug: "terapeuta" },
      { name: "Mindfulness & Meditación",slug: "mindfulness" },
      { name: "Desarrollo Personal",     slug: "desarrollo-personal" },
      { name: "Coaching Empresarial",    slug: "coaching-empresarial" },
    ],
  },
  {
    name: "Belleza & Estética",
    slug: "estetica",
    subcategories: [
      { name: "Peluquería Femenina",       slug: "peluqueria-femenina" },
      { name: "Barbería",                  slug: "barberia" },
      { name: "Spa & Masajes",             slug: "spa-masajes" },
      { name: "Manicure & Pedicure",       slug: "manicure-pedicure" },
      { name: "Maquillaje & Cejas",        slug: "maquillaje-cejas" },
      { name: "Micropigmentación",         slug: "micropigmentacion" },
      { name: "Bronceado & Depilación",    slug: "bronceado-depilacion" },
      { name: "Estética Corporal",         slug: "estetica-corporal" },
    ],
    aiContext: {
      description: "Salones de belleza, barberías, spas y centros de estética que ofrecen servicios de transformación y cuidado personal.",
      content_topics: [
        "Antes y después de tratamientos o cortes",
        "Tendencias de moda: colores, estilos y técnicas del momento",
        "Tips de cuidado del cabello, piel o uñas en casa",
        "Presentación de servicios y precios especiales",
        "Testimonios y reseñas de clientes satisfechas",
        "Detrás de escena: el trabajo del equipo",
        "Productos que usan y recomiendan",
        "Disponibilidad de citas: agenda tu turno",
      ],
      recommended_tone: "cercano, inspirador y con energía femenina positiva",
      audience: "mujeres de 18-50 años que cuidan su apariencia y bienestar personal",
      content_formats: ["foto de antes/después", "reel de transformación", "carousel de tendencias", "post de disponibilidad de citas"],
      keywords: ["belleza", "estética", "cabello", "uñas", "maquillaje", "piel", "spa", "transformación"],
    },
  },
  {
    name: "Moda & Ropa",
    slug: "moda",
    subcategories: [
      { name: "Boutique Femenina",     slug: "boutique-femenina" },
      { name: "Moda Masculina",        slug: "moda-masculina" },
      { name: "Ropa Infantil",         slug: "ropa-infantil" },
      { name: "Zapatería",             slug: "zapateria" },
      { name: "Bisutería & Accesorios",slug: "bisuteria-accesorios" },
      { name: "Ropa Deportiva",        slug: "ropa-deportiva" },
      { name: "Ropa de Baño",          slug: "ropa-bano" },
    ],
  },
  {
    name: "Joyería & Relojes",
    slug: "joyeria",
    subcategories: [
      { name: "Joyería",          slug: "joyeria-fina" },
      { name: "Relojería",        slug: "relojeria" },
      { name: "Bisutería Fina",   slug: "bisuteria-fina" },
      { name: "Orfebrería",       slug: "orfeberia" },
    ],
  },
  {
    name: "Tecnología & Software",
    slug: "tecnologia",
    subcategories: [
      { name: "Software & SaaS",              slug: "software-saas" },
      { name: "Agencia de Marketing Digital", slug: "marketing-digital" },
      { name: "Reparación de Celulares",      slug: "reparacion-celulares" },
      { name: "Reparación de Computadores",   slug: "reparacion-computadores" },
      { name: "Cámaras & Seguridad",          slug: "camaras-seguridad" },
      { name: "Diseño Gráfico & Web",         slug: "diseno-grafico-web" },
      { name: "Domótica & Automatización",    slug: "domotica" },
    ],
    aiContext: {
      description: "Empresas de tecnología, software, servicios digitales y soluciones tech para negocios y consumidores finales.",
      content_topics: [
        "Funcionalidades y beneficios del producto o servicio tech",
        "Casos de éxito y testimonios de clientes",
        "Tips de productividad y herramientas digitales",
        "Tendencias tecnológicas del sector",
        "Comparativa de soluciones: antes vs después",
        "Detrás de escena del equipo de desarrollo",
      ],
      recommended_tone: "profesional y accesible, con lenguaje técnico simplificado",
      audience: "empresarios, emprendedores y profesionales que buscan soluciones tecnológicas",
      content_formats: ["carousel educativo", "reel de demostración", "post de caso de éxito", "infografía de funcionalidades"],
      keywords: ["tecnología", "innovación", "digital", "software", "automatización", "productividad"],
    },
  },
  {
    name: "SaaS & Marketing con IA",
    slug: "saas-marketing-ia",
    subcategories: [
      { name: "SaaS / Marketing de contenidos con IA", slug: "saas-contenidos-ia" },
      { name: "Gestión de Redes Sociales (SMMA)",      slug: "smma" },
      { name: "Agencia de Marketing Digital",           slug: "agencia-mkt-digital-ia" },
      { name: "Community Manager",                      slug: "community-manager" },
      { name: "Plataforma de IA / No-Code",             slug: "plataforma-ia" },
      { name: "Consultoría en Transformación Digital",  slug: "transformacion-digital" },
    ],
    aiContext: {
      description: "Plataformas SaaS, agencias y consultoras que usan Inteligencia Artificial para crear contenido, gestionar redes sociales y automatizar el marketing digital de sus clientes.",
      content_topics: [
        "Cómo la IA ahorra tiempo en la creación de contenido",
        "Resultados reales de clientes que usan IA en su marketing",
        "Tips rápidos para gestionar redes sociales con IA",
        "Casos de éxito: negocios que escalaron con automatización",
        "Diferencia entre publicar manualmente vs usar IA",
        "Tendencias de marketing con IA para pequeñas empresas",
        "Por qué la consistencia en redes sociales genera ventas",
        "Cómo crear 30 posts en minutos con IA",
      ],
      recommended_tone: "profesional y cercano, con lenguaje tech accesible para no-técnicos",
      audience: "emprendedores, dueños de negocios y marketers que quieren hacer crecer su presencia digital con IA",
      content_formats: ["carousel educativo", "reel de tip rápido", "post de caso de éxito", "antes y después", "comparativa manual vs IA"],
      keywords: ["IA", "inteligencia artificial", "automatización", "marketing digital", "redes sociales", "SaaS", "contenido", "eficiencia"],
    },
  },
  {
    name: "Electrónica & Electrodomésticos",
    slug: "electronica",
    subcategories: [
      { name: "Tienda de Electrónica",          slug: "tienda-electronica" },
      { name: "Reparación de Electrodomésticos",slug: "reparacion-electrodomesticos" },
      { name: "Audio & Video",                  slug: "audio-video" },
      { name: "Celulares & Accesorios",         slug: "celulares-accesorios" },
    ],
  },
  {
    name: "Construcción & Remodelación",
    slug: "construccion",
    subcategories: [
      { name: "Constructora",             slug: "constructora" },
      { name: "Ferretería",               slug: "ferreteria" },
      { name: "Decoración de Interiores", slug: "decoracion-interiores" },
      { name: "Electricistas",            slug: "electricistas" },
      { name: "Plomería",                 slug: "plomeria" },
      { name: "Carpintería",              slug: "carpinteria" },
      { name: "Paisajismo & Jardines",    slug: "paisajismo-jardines" },
      { name: "Pintura & Acabados",       slug: "pintura-acabados" },
    ],
  },
  {
    name: "Hogar & Decoración",
    slug: "hogar",
    subcategories: [
      { name: "Mueblería",              slug: "muebleria" },
      { name: "Iluminación",            slug: "iluminacion" },
      { name: "Lencería del Hogar",     slug: "lenceria-hogar" },
      { name: "Artículos de Decoración",slug: "articulos-decoracion" },
      { name: "Cocinas & Baños",        slug: "cocinas-banos" },
    ],
  },
  {
    name: "Servicios del Hogar",
    slug: "servicios-hogar",
    subcategories: [
      { name: "Aseo & Limpieza",       slug: "aseo-limpieza" },
      { name: "Lavandería",            slug: "lavanderia" },
      { name: "Jardinería",            slug: "jardineria" },
      { name: "Seguridad Residencial", slug: "seguridad-residencial" },
    ],
  },
  {
    name: "Educación",
    slug: "educacion",
    subcategories: [
      { name: "Clases Particulares",       slug: "clases-particulares" },
      { name: "Academia de Idiomas",       slug: "academia-idiomas" },
      { name: "Guardería & Preescolar",    slug: "guarderia-preescolar" },
      { name: "Academia de Música",        slug: "academia-musica" },
      { name: "Cursos Online",             slug: "cursos-online" },
      { name: "Preparatoria Universitaria",slug: "preparatoria-universitaria" },
      { name: "Arte & Pintura",            slug: "arte-pintura" },
    ],
    aiContext: {
      description: "Academias, colegios, cursos y servicios educativos que forman personas en diversas habilidades y conocimientos.",
      content_topics: [
        "Metodologías de enseñanza y resultados de aprendizaje",
        "Historias de transformación de estudiantes",
        "Tips y consejos de estudio aplicables",
        "Fechas de inscripción, horarios y modalidades",
        "Por qué invertir en educación es la mejor decisión",
        "Testimonios de egresados y padres de familia",
      ],
      recommended_tone: "motivador y cercano, con autoridad académica pero sin rigidez",
      audience: "estudiantes, padres de familia y profesionales en búsqueda de formación y desarrollo",
      content_formats: ["carousel de tips", "reel de testimonios", "post de resultados", "infografía de metodología"],
      keywords: ["educación", "aprendizaje", "formación", "cursos", "enseñanza", "conocimiento"],
    },
  },
  {
    name: "Fitness & Deporte",
    slug: "gym",
    subcategories: [
      { name: "Gimnasio de Pesas",     slug: "gimnasio-pesas" },
      { name: "Yoga & Pilates",        slug: "yoga-pilates" },
      { name: "Natación",              slug: "natacion" },
      { name: "Artes Marciales",       slug: "artes-marciales" },
      { name: "Entrenamiento Personal",slug: "entrenamiento-personal" },
      { name: "Crossfit",              slug: "crossfit" },
      { name: "Ciclismo & Spinning",   slug: "ciclismo-spinning" },
      { name: "Deportes Acuáticos",    slug: "deportes-acuaticos" },
    ],
    aiContext: {
      description: "Gimnasios, entrenadores personales y centros deportivos que ayudan a las personas a mejorar su condición física y alcanzar sus metas de salud.",
      content_topics: [
        "Rutinas de ejercicio y técnicas de entrenamiento",
        "Transformaciones físicas y testimonios de clientes",
        "Nutrición y alimentación para el deporte",
        "Motivación para mantener el hábito del ejercicio",
        "Beneficios de cada modalidad de entrenamiento",
        "Antes y después de programas de entrenamiento",
      ],
      recommended_tone: "energético y motivador, con mensajes directos y empoderadoras",
      audience: "personas que buscan mejorar su salud, forma física y bienestar; desde principiantes hasta deportistas",
      content_formats: ["reel de rutina rápida", "carousel de tips nutricionales", "post de transformación", "video motivacional"],
      keywords: ["fitness", "ejercicio", "salud", "entrenamiento", "gym", "bienestar", "deporte"],
    },
  },
  {
    name: "Eventos & Entretenimiento",
    slug: "eventos",
    subcategories: [
      { name: "Fotografía & Video",      slug: "fotografia-video" },
      { name: "DJ & Música en Vivo",     slug: "dj-musica" },
      { name: "Catering",                slug: "catering" },
      { name: "Decoración de Eventos",   slug: "decoracion-eventos" },
      { name: "Animación & Entretenimiento", slug: "animacion-entretenimiento" },
      { name: "Bar & Discoteca",         slug: "bar-discoteca" },
      { name: "Organización de Bodas",   slug: "bodas" },
      { name: "Club Nocturno",           slug: "club-nocturno" },
    ],
  },
  {
    name: "Turismo & Viajes",
    slug: "turismo",
    subcategories: [
      { name: "Agencia de Viajes",    slug: "agencia-viajes" },
      { name: "Hotel & Hostal",       slug: "hotel-hostal" },
      { name: "Renta de Vehículos",   slug: "renta-vehiculos" },
      { name: "Tours & Excursiones",  slug: "tours-excursiones" },
      { name: "Glamping & Ecoturismo",slug: "glamping-ecoturismo" },
    ],
  },
  {
    name: "Automotriz & Vehículos",
    slug: "automotriz",
    subcategories: [
      { name: "Concesionario",        slug: "concesionario" },
      { name: "Taller Mecánico",      slug: "taller-mecanico" },
      { name: "Venta de Repuestos",   slug: "venta-repuestos" },
      { name: "Lavadero de Carros",   slug: "lavadero-carros" },
      { name: "Motos & Accesorios",   slug: "motos-accesorios" },
      { name: "Vehículos Eléctricos", slug: "vehiculos-electricos" },
    ],
  },
  {
    name: "Mascotas & Veterinaria",
    slug: "mascotas",
    subcategories: [
      { name: "Clínica Veterinaria",  slug: "clinica-veterinaria" },
      { name: "Peluquería Canina",    slug: "peluqueria-canina" },
      { name: "Tienda de Mascotas",   slug: "tienda-mascotas" },
      { name: "Adiestramiento",       slug: "adiestramiento" },
      { name: "Hotel de Mascotas",    slug: "hotel-mascotas" },
    ],
  },
  {
    name: "Energía Solar",
    slug: "energia-solar",
    subcategories: [
      { name: "Instalación Residencial", slug: "solar-residencial" },
      { name: "Instalación Comercial",   slug: "solar-comercial" },
      { name: "Instalación Industrial",  slug: "solar-industrial" },
      { name: "Instalación Agrícola",    slug: "solar-agricola" },
      { name: "Instalación en Minigranjas", slug: "solar-minigranjas" },
      { name: "Mantenimiento Solar",     slug: "solar-mantenimiento" },
      { name: "Asesoría Energética",     slug: "solar-asesoria" },
    ],
  },
  {
    name: "Inmobiliaria",
    slug: "inmobiliaria",
    subcategories: [
      { name: "Venta de Vivienda Nueva", slug: "vivienda-nueva" },
      { name: "Venta de Usados",         slug: "vivienda-usada" },
      { name: "Arriendo & Alquiler",     slug: "arriendo" },
      { name: "Finca Raíz Comercial",    slug: "finca-raiz-comercial" },
      { name: "Finca & Lotes",           slug: "finca-lotes" },
    ],
    aiContext: {
      description: "Agentes y empresas inmobiliarias que ayudan a personas y empresas a comprar, vender o arrendar propiedades residenciales y comerciales.",
      content_topics: [
        "Propiedades disponibles en venta o arriendo",
        "Tips para comprar tu primera vivienda",
        "Tendencias del mercado inmobiliario local",
        "Consejos de decoración e inversión en propiedad raíz",
        "Testimonios de clientes que encontraron su hogar ideal",
        "Comparación de zonas y barrios para vivir o invertir",
      ],
      recommended_tone: "confiable y aspiracional, con datos concretos y cercanía emocional",
      audience: "familias y parejas buscando vivienda, inversionistas y empresas en búsqueda de locales o bodegas",
      content_formats: ["post de propiedad destacada", "carousel de comparativa de zonas", "reel de recorrido virtual", "infografía de tips de compra"],
      keywords: ["inmobiliaria", "vivienda", "propiedad", "apartamento", "casa", "inversión", "finca raíz"],
    },
  },
  {
    name: "Finanzas & Seguros",
    slug: "finanzas",
    subcategories: [
      { name: "Seguros",               slug: "seguros" },
      { name: "Créditos & Préstamos",  slug: "creditos-prestamos" },
      { name: "Contabilidad",          slug: "contabilidad" },
      { name: "Asesoría Financiera",   slug: "asesoria-financiera" },
      { name: "Inversiones & Bolsa",   slug: "inversiones-bolsa" },
    ],
  },
  {
    name: "Legal & Jurídico",
    slug: "legal",
    subcategories: [
      { name: "Abogado",               slug: "abogado" },
      { name: "Notaría",               slug: "notaria" },
      { name: "Consultoría Legal",     slug: "consultoria-legal" },
      { name: "Gestión de Trámites",   slug: "gestion-tramites" },
    ],
  },
  {
    name: "Comercio & Retail",
    slug: "retail",
    subcategories: [
      { name: "Tienda de Variedades",  slug: "tienda-variedades" },
      { name: "Supermercado & Fruver", slug: "supermercado" },
      { name: "Papelería & Útiles",    slug: "papeleria" },
      { name: "Distribuidora",         slug: "distribuidora" },
      { name: "Mayorista & Proveedor", slug: "mayorista" },
    ],
  },
  {
    name: "Arte & Diseño Creativo",
    slug: "arte",
    subcategories: [
      { name: "Estudio de Diseño",    slug: "estudio-diseno" },
      { name: "Galería de Arte",      slug: "galeria-arte" },
      { name: "Ilustración",          slug: "ilustracion" },
      { name: "Fotografía Artística", slug: "fotografia-artistica" },
      { name: "Artesanías",           slug: "artesanias" },
    ],
  },
  {
    name: "Publicidad & Comunicaciones",
    slug: "publicidad",
    subcategories: [
      { name: "Agencia de Publicidad",       slug: "agencia-publicidad" },
      { name: "Producción Audiovisual",      slug: "produccion-audiovisual" },
      { name: "Relaciones Públicas",         slug: "relaciones-publicas" },
      { name: "Impresión & Señalización",    slug: "impresion-senalizacion" },
      { name: "Medios & Comunicación",       slug: "medios-comunicacion" },
    ],
  },
  {
    name: "Logística & Transporte",
    slug: "logistica",
    subcategories: [
      { name: "Mensajería & Domicilios",  slug: "mensajeria" },
      { name: "Mudanzas",                 slug: "mudanzas" },
      { name: "Transporte de Carga",      slug: "transporte-carga" },
      { name: "Courier Internacional",    slug: "courier-internacional" },
      { name: "Flota & Camiones",         slug: "flota-camiones" },
    ],
  },
  {
    name: "Seguridad & Vigilancia",
    slug: "seguridad",
    subcategories: [
      { name: "Empresa de Vigilancia",    slug: "empresa-vigilancia" },
      { name: "Alarmas & Cámaras",        slug: "alarmas-camaras" },
      { name: "Cerrajería",               slug: "cerrajeria" },
      { name: "Blindaje & Protección",    slug: "blindaje-proteccion" },
    ],
  },
  {
    name: "Agricultura & Agro",
    slug: "agro",
    subcategories: [
      { name: "Finca & Cultivos",    slug: "finca-cultivos" },
      { name: "Agroinsumos",         slug: "agroinsumos" },
      { name: "Vivero & Plantas",    slug: "vivero-plantas" },
      { name: "Ganadería",           slug: "ganaderia" },
      { name: "Acuicultura & Pesca", slug: "acuicultura" },
    ],
  },
  {
    name: "Industria & Manufactura",
    slug: "manufactura",
    subcategories: [
      { name: "Fábrica & Planta",    slug: "fabrica-planta" },
      { name: "Metalúrgica",         slug: "metalurgica" },
      { name: "Plásticos & Caucho",  slug: "plasticos-caucho" },
      { name: "Textil Industrial",   slug: "textil-industrial" },
      { name: "Maquinaria & Equipos",slug: "maquinaria-equipos" },
    ],
  },
  {
    name: "Club & Membresías",
    slug: "club",
    subcategories: [
      { name: "Club Empresarial",           slug: "club-empresarial" },
      { name: "Red de Referidos",           slug: "red-referidos" },
      { name: "Franquicia",                 slug: "franquicia" },
      { name: "Asociación Gremial",         slug: "asociacion-gremial" },
      { name: "Comunidad & Networking",     slug: "comunidad-networking" },
    ],
  },
  {
    name: "ONG & Organizaciones Sociales",
    slug: "ong",
    subcategories: [
      { name: "Fundación",                       slug: "fundacion" },
      { name: "Asociación",                      slug: "asociacion" },
      { name: "Corporación sin Ánimo de Lucro",  slug: "corporacion-sal" },
      { name: "Iglesia & Comunidad Religiosa",   slug: "iglesia-comunidad" },
    ],
  },
  {
    name: "Consultoría & Servicios Profesionales",
    slug: "consultoria",
    subcategories: [
      { name: "Consultoría Empresarial", slug: "consultoria-empresarial" },
      { name: "Recursos Humanos & Reclutamiento", slug: "rrhh" },
      { name: "Gestión de Proyectos",    slug: "gestion-proyectos" },
      { name: "Auditoría",               slug: "auditoria" },
    ],
  },
];

/** Mapa nombre-de-industria → entrada del catálogo (para búsqueda rápida) */
export const INDUSTRY_MAP = new Map(INDUSTRY_CATALOG.map(e => [e.name, e]));

/** Mapa slug-de-sub-industria → nombre legible (para display) */
export const SUB_INDUSTRY_SLUG_MAP = new Map(
  INDUSTRY_CATALOG.flatMap(e => e.subcategories.map(s => [s.slug, s.name]))
);

/** Devuelve el slug de sub-industria dado el nombre de sub-industria (o null si no existe) */
export function subIndustryToSlug(subIndustryName: string | null | undefined): string | null {
  if (!subIndustryName) return null;
  for (const entry of INDUSTRY_CATALOG) {
    const sub = entry.subcategories.find(s => s.name === subIndustryName);
    if (sub) return sub.slug;
  }
  return null;
}

/** Devuelve las sub-industrias de una industria dada (o [] si no existe) */
export function getSubcategories(industryName: string): IndustrySubcategory[] {
  return INDUSTRY_MAP.get(industryName)?.subcategories ?? [];
}
