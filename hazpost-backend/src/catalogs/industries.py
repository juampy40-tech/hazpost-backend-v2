# ============================================================
# INDUSTRIES CATALOG — HazPost
# Fuente única para /api/industries, onboarding y contexto IA
#
# IMPORTANTE:
# - Este archivo es Python puro. No pegar TypeScript aquí.
# - El campo "name" debe coincidir con el valor guardado en businesses.industry.
# - El campo subcategories[].name debe coincidir con businesses.sub_industry.
# - aiContext ayuda a la IA a crear contenido más relevante.
# ============================================================

DEFAULT_AI_CONTEXT = {
    "description": "Negocio que busca crecer en redes sociales.",
    "content_topics": [
        "promociones",
        "testimonios",
        "contenido educativo",
        "ventas"
    ],
    "recommended_tone": "profesional y cercano",
    "audience": "clientes potenciales",
    "content_formats": [
        "reels",
        "carousels",
        "stories"
    ],
    "keywords": [
        "negocio",
        "ventas",
        "clientes"
    ]
}

INDUSTRY_CATALOG = [{'name': 'Restaurante & Comida',
  'slug': 'restaurante',
  'subcategories': [{'name': 'Restaurante Colombiano', 'slug': 'restaurante-colombiano'},
                    {'name': 'Restaurante Gourmet', 'slug': 'restaurante-gourmet'},
                    {'name': 'Restaurante Familiar', 'slug': 'restaurante-familiar'},
                    {'name': 'Comida Típica & Casera', 'slug': 'comida-tipica-casera'},
                    {'name': 'Pizzería', 'slug': 'pizzeria'},
                    {'name': 'Pizzería Artesanal', 'slug': 'pizzeria-artesanal'},
                    {'name': 'Hamburguesería', 'slug': 'hamburgueseria'},
                    {'name': 'Hamburguesería Premium', 'slug': 'hamburgueseria-premium'},
                    {'name': 'Sushi & Japonés', 'slug': 'sushi-japones'},
                    {'name': 'Comida Mexicana', 'slug': 'comida-mexicana'},
                    {'name': 'Comida Rápida', 'slug': 'comida-rapida'},
                    {'name': 'Comida Rápida Premium', 'slug': 'comida-rapida-premium'},
                    {'name': 'Comida Saludable', 'slug': 'comida-saludable'},
                    {'name': 'Comida Vegana & Plant-based', 'slug': 'comida-vegana'},
                    {'name': 'Cafetería', 'slug': 'cafeteria'},
                    {'name': 'Brunch & Café', 'slug': 'brunch-cafe'},
                    {'name': 'Panadería & Pastelería', 'slug': 'panaderia-pasteleria'},
                    {'name': 'Repostería & Tortas', 'slug': 'reposteria-tortas'},
                    {'name': 'Postres Gourmet', 'slug': 'postres-gourmet'},
                    {'name': 'Heladería', 'slug': 'heladeria'},
                    {'name': 'Bar & Gastrobar', 'slug': 'bar-gastrobar'},
                    {'name': 'Dark Kitchen', 'slug': 'dark-kitchen'},
                    {'name': 'Catering Gastronómico', 'slug': 'catering-gastronomico'},
                    {'name': 'Charcutería & Deli', 'slug': 'charcuteria-deli'},
                    {'name': 'Food Truck', 'slug': 'food-truck'}],
  'aiContext': {'description': 'Restaurantes, cafeterías, panaderías, dark kitchens, bares, '
                               'gastrobares y negocios de comida que buscan atraer clientes con '
                               'contenido apetitoso, cercano y orientado a ventas.',
                'content_topics': ['Platos destacados, menús especiales y productos más vendidos',
                                   'Proceso de preparación detrás de escena',
                                   'Historia del chef, fundador o equipo',
                                   'Ingredientes frescos, locales o de temporada',
                                   'Promociones especiales, combos, descuentos y fechas clave',
                                   'Experiencia del cliente: ambiente, sabor, servicio y momentos',
                                   'Reels de preparación rápida, emplatado o cocina en acción',
                                   'Contenido de antojo para activar pedidos y reservas',
                                   'Testimonios, reseñas y contenido generado por clientes',
                                   'Celebraciones: cumpleaños, fechas especiales y eventos'],
                'recommended_tone': 'cálido, apetitoso, cercano y comercial',
                'audience': 'familias, parejas, grupos de amigos, trabajadores y personas que '
                            'buscan dónde comer, pedir a domicilio, celebrar o descubrir nuevos '
                            'sabores',
                'content_formats': ['foto de plato con copy de antojo',
                                    'reel de preparación o emplatado',
                                    'carousel de menú o combos',
                                    'story de promoción del día',
                                    'post de reseña o testimonio',
                                    'video corto de ambiente y experiencia'],
                'keywords': ['gastronomía',
                             'sabor',
                             'antojo',
                             'delicioso',
                             'menú',
                             'chef',
                             'comida casera',
                             'reservas',
                             'pedidos',
                             'domicilio',
                             'promoción',
                             'experiencia']}},
 {'name': 'Belleza & Estética',
  'slug': 'estetica',
  'subcategories': [{'name': 'Peluquería Femenina', 'slug': 'peluqueria-femenina'},
                    {'name': 'Barbería', 'slug': 'barberia'},
                    {'name': 'Colorimetría & Balayage', 'slug': 'colorimetria-balayage'},
                    {'name': 'Extensiones de Cabello', 'slug': 'extensiones-cabello'},
                    {'name': 'Spa & Masajes', 'slug': 'spa-masajes'},
                    {'name': 'Manicure & Pedicure', 'slug': 'manicure-pedicure'},
                    {'name': 'Nail Art & Uñas Acrílicas', 'slug': 'nail-art-unas-acrilicas'},
                    {'name': 'Maquillaje & Cejas', 'slug': 'maquillaje-cejas'},
                    {'name': 'Pestañas & Lifting', 'slug': 'pestanas-lifting'},
                    {'name': 'Micropigmentación', 'slug': 'micropigmentacion'},
                    {'name': 'Depilación Láser', 'slug': 'depilacion-laser'},
                    {'name': 'Bronceado & Depilación', 'slug': 'bronceado-depilacion'},
                    {'name': 'Estética Facial', 'slug': 'estetica-facial'},
                    {'name': 'Estética Corporal', 'slug': 'estetica-corporal'},
                    {'name': 'Medicina Estética', 'slug': 'medicina-estetica'},
                    {'name': 'Botox & Armonización Facial', 'slug': 'botox-armonizacion-facial'},
                    {'name': 'Skincare Studio', 'slug': 'skincare-studio'}],
  'aiContext': {'description': 'Salones de belleza, barberías, spas, estudios de uñas, centros de '
                               'estética facial y corporal, maquillaje, cejas, pestañas y medicina '
                               'estética que venden transformación, confianza y cuidado personal.',
                'content_topics': ['Antes y después de tratamientos, cortes, uñas o procedimientos',
                                   'Transformaciones reales de clientes',
                                   'Tendencias de color, cabello, uñas, cejas, pestañas y skincare',
                                   'Tips de cuidado en casa para cabello, piel, uñas o rostro',
                                   'Presentación clara de servicios, paquetes y promociones',
                                   'Testimonios y reseñas de clientas satisfechas',
                                   'Detrás de escena del equipo y proceso profesional',
                                   'Productos utilizados, beneficios y recomendaciones',
                                   'Disponibilidad de citas, agenda y llamados a reservar',
                                   'Contenido emocional sobre autoestima, confianza y autocuidado'],
                'recommended_tone': 'cercano, aspiracional, elegante y emocional',
                'audience': 'mujeres y hombres que buscan verse mejor, sentirse seguros, cuidar su '
                            'imagen personal y vivir una experiencia estética confiable',
                'content_formats': ['foto de antes/después',
                                    'reel de transformación',
                                    'carousel de servicios y beneficios',
                                    'post de disponibilidad de citas',
                                    'story con promoción o agenda',
                                    'video corto del proceso o resultado final'],
                'keywords': ['belleza',
                             'estética',
                             'cabello',
                             'barbería',
                             'uñas',
                             'cejas',
                             'pestañas',
                             'maquillaje',
                             'piel',
                             'skincare',
                             'spa',
                             'transformación',
                             'autocuidado',
                             'agenda',
                             'citas']}},
 {'name': 'Moda & Ropa',
  'slug': 'moda',
  'subcategories': [{'name': 'Boutique Femenina', 'slug': 'boutique-femenina'},
                    {'name': 'Moda Masculina', 'slug': 'moda-masculina'},
                    {'name': 'Moda Urbana & Streetwear', 'slug': 'streetwear'},
                    {'name': 'Moda Oversized', 'slug': 'moda-oversized'},
                    {'name': 'Ropa Deportiva', 'slug': 'ropa-deportiva'},
                    {'name': 'Ropa Interior & Lencería', 'slug': 'lenceria'},
                    {'name': 'Shapewear & Fajas', 'slug': 'shapewear-fajas'},
                    {'name': 'Ropa Infantil', 'slug': 'ropa-infantil'},
                    {'name': 'Moda Plus Size', 'slug': 'plus-size'},
                    {'name': 'Moda de Baño', 'slug': 'moda-bano'},
                    {'name': 'Zapatería', 'slug': 'zapateria'},
                    {'name': 'Tenis & Sneakers', 'slug': 'tenis-sneakers'},
                    {'name': 'Bisutería & Accesorios', 'slug': 'bisuteria-accesorios'},
                    {'name': 'Bolsos & Marroquinería', 'slug': 'bolsos-marroquineria'}],
  'aiContext': {'description': 'Marcas de ropa, boutiques, accesorios, calzado y moda que buscan '
                               'vender estilo, identidad y tendencias mediante contenido visual y '
                               'emocional en redes sociales.',
                'content_topics': ['Outfits y combinaciones de ropa',
                                   'Tendencias de moda y temporadas',
                                   'Lanzamientos de nuevas colecciones',
                                   'Looks completos y recomendaciones de estilo',
                                   'Antes y después de outfits',
                                   'Contenido aspiracional y lifestyle',
                                   'Promociones, drops y descuentos limitados',
                                   'Videos de empaque y experiencia de compra',
                                   'Influencers y clientes usando las prendas',
                                   'Tips de moda y combinación de accesorios'],
                'recommended_tone': 'aspiracional, moderno, visual y emocional',
                'audience': 'personas interesadas en verse bien, seguir tendencias y expresar su '
                            'identidad mediante la moda y accesorios',
                'content_formats': ['reel de outfit',
                                    'carousel de colección',
                                    'foto lifestyle',
                                    'video de empaque',
                                    'story de lanzamiento',
                                    'UGC con clientes o influencers'],
                'keywords': ['moda',
                             'ropa',
                             'outfit',
                             'streetwear',
                             'estilo',
                             'fashion',
                             'tendencia',
                             'boutique',
                             'accesorios',
                             'sneakers',
                             'ropa femenina',
                             'ropa masculina']}},
{'name': 'Salud & Bienestar',
  'slug': 'salud',
  'subcategories': [{'name': 'Medicina General', 'slug': 'medicina-general'},
                    {'name': 'Psicología', 'slug': 'psicologia'},
                    {'name': 'Odontología', 'slug': 'odontologia'},
                    {'name': 'Ortodoncia', 'slug': 'ortodoncia'},
                    {'name': 'Fisioterapia', 'slug': 'fisioterapia'},
                    {'name': 'Quiropráctica', 'slug': 'quiropractica'},
                    {'name': 'Nutrición', 'slug': 'nutricion'},
                    {'name': 'Nutrición Deportiva', 'slug': 'nutricion-deportiva'},
                    {'name': 'Dermatología', 'slug': 'dermatologia'},
                    {'name': 'Salud Femenina', 'slug': 'salud-femenina'},
                    {'name': 'Óptica', 'slug': 'optica'},
                    {'name': 'Farmacia', 'slug': 'farmacia'},
                    {'name': 'Laboratorio Clínico', 'slug': 'laboratorio-clinico'},
                    {'name': 'Medicina Alternativa', 'slug': 'medicina-alternativa'},
                    {'name': 'Bienestar Integral', 'slug': 'bienestar-integral'}],
  'aiContext': {'description': 'Clínicas, especialistas, centros médicos y profesionales de salud '
                               'que ayudan a las personas a mejorar su bienestar físico, mental y '
                               'emocional mediante atención profesional y contenido educativo.',
                'content_topics': ['Consejos prácticos de salud y prevención',
                                   'Mitos y verdades sobre tratamientos y bienestar',
                                   'Beneficios de hábitos saludables',
                                   'Antes y después de procesos de recuperación',
                                   'Testimonios y experiencias reales de pacientes',
                                   'Explicación sencilla de procedimientos médicos',
                                   'Tips de autocuidado y bienestar diario',
                                   'Importancia de chequeos preventivos',
                                   'Detrás de escena del equipo profesional',
                                   'Contenido educativo para generar confianza'],
                'recommended_tone': 'profesional, humano, confiable y educativo',
                'audience': 'personas interesadas en mejorar su salud, bienestar, calidad de vida '
                            'y prevenir problemas físicos o emocionales',
                'content_formats': ['carousel educativo',
                                    'video explicativo corto',
                                    'reel de tips de salud',
                                    'post de testimonio',
                                    'story informativa',
                                    'preguntas frecuentes'],
                'keywords': ['salud',
                             'bienestar',
                             'prevención',
                             'nutrición',
                             'clínica',
                             'doctor',
                             'especialista',
                             'autocuidado',
                             'salud mental',
                             'recuperación',
                             'tratamiento']}},
 {'name': 'Fitness & Deporte',
  'slug': 'gym',
  'subcategories': [{'name': 'Gimnasio de Pesas', 'slug': 'gimnasio-pesas'},
                    {'name': 'Entrenamiento Funcional', 'slug': 'entrenamiento-funcional'},
                    {'name': 'Crossfit', 'slug': 'crossfit'},
                    {'name': 'Hyrox & Fitness Competitivo', 'slug': 'hyrox'},
                    {'name': 'Entrenamiento Personal', 'slug': 'entrenamiento-personal'},
                    {'name': 'Yoga & Pilates', 'slug': 'yoga-pilates'},
                    {'name': 'Running Club', 'slug': 'running-club'},
                    {'name': 'Ciclismo & Spinning', 'slug': 'ciclismo-spinning'},
                    {'name': 'Natación', 'slug': 'natacion'},
                    {'name': 'Artes Marciales', 'slug': 'artes-marciales'},
                    {'name': 'Boxing & Combat Fitness', 'slug': 'boxing-combat'},
                    {'name': 'Recovery & Wellness', 'slug': 'recovery-wellness'},
                    {'name': 'Suplementación Deportiva', 'slug': 'suplementacion-deportiva'},
                    {'name': 'Fitness Boutique', 'slug': 'fitness-boutique'},
                    {'name': 'Deportes Acuáticos', 'slug': 'deportes-acuaticos'}],
  'aiContext': {'description': 'Gimnasios, boxes de crossfit, estudios fitness, entrenadores, centros deportivos '
                               'y marcas wellness que ayudan a las personas a transformar su cuerpo, mejorar '
                               'su salud, rendimiento físico y estilo de vida mediante entrenamiento, disciplina '
                               'y bienestar.',
                'content_topics': ['Rutinas de ejercicio y técnicas de entrenamiento',
                                   'Transformaciones físicas y testimonios de clientes',
                                   'Nutrición y alimentación para el deporte',
                                   'Motivación para mantener el hábito del ejercicio',
                                   'Beneficios de cada modalidad de entrenamiento',
                                   'Entrenamientos funcionales, fuerza, HIIT y rendimiento',
                                   'Recuperación muscular, movilidad y wellness',
                                   'Motivación, disciplina y transformación personal',
                                   'Contenido lifestyle fitness y hábitos saludables',
                                   'Suplementación y nutrición deportiva',
                                   'Retos fitness y comunidad',
                                   'Antes y después de programas de entrenamiento'],
                'recommended_tone': 'energético, motivador, moderno y enfocado en transformación personal',
                'audience': 'personas que buscan mejorar su salud, forma física y bienestar; desde '
                            'principiantes hasta deportistas',
                'content_formats': ['reel de rutina',
                                    'transformación antes/después',
                                    'video motivacional',
                                    'tips fitness rápidos',
                                    'POV entrenamiento',
                                    'carousel educativo',
                                    'contenido lifestyle fitness'],
                'keywords': ['fitness',
                             'ejercicio',
                             'salud',
                             'entrenamiento',
                             'gym',
                             'bienestar',
                             'deporte']}},
 {'name': 'Tecnología & Software',
  'slug': 'tecnologia',
  'subcategories': [{'name': 'Software Empresarial', 'slug': 'software-empresarial'},
                    {'name': 'Software & SaaS', 'slug': 'software-saas'},
                    {'name': 'Desarrollo Web', 'slug': 'desarrollo-web'},
                    {'name': 'Desarrollo de Apps', 'slug': 'desarrollo-apps'},
                    {'name': 'Soporte TI & Sistemas', 'slug': 'soporte-ti'},
                    {'name': 'Ciberseguridad', 'slug': 'ciberseguridad'},
                    {'name': 'Cloud & Servidores', 'slug': 'cloud-servidores'},
                    {'name': 'Infraestructura Tecnológica', 'slug': 'infraestructura-ti'},
                    {'name': 'Reparación de Celulares', 'slug': 'reparacion-celulares'},
                    {'name': 'Reparación de Computadores', 'slug': 'reparacion-computadores'},
                    {'name': 'Venta de Computadores & Hardware', 'slug': 'hardware-computadores'},
                    {'name': 'Domótica & Smart Home', 'slug': 'domotica-smart-home'},
                    {'name': 'Automatización Empresarial', 'slug': 'automatizacion-empresarial'}],
  'aiContext': {'description': 'Empresas de tecnología, software, soporte TI, desarrollo web, '
                               'infraestructura tecnológica y soluciones digitales que ayudan a '
                               'personas y negocios a mejorar productividad, seguridad y '
                               'transformación digital.',
                'content_topics': ['Beneficios y funcionalidades del software o solución tech',
                                   'Casos de éxito y resultados reales de clientes',
                                   'Automatización de procesos y ahorro de tiempo',
                                   'Tips tecnológicos para empresas y emprendedores',
                                   'Ciberseguridad y protección de datos',
                                   'Comparativas antes vs después de implementar tecnología',
                                   'Demostraciones rápidas del producto o plataforma',
                                   'Tendencias tecnológicas, IA y productividad',
                                   'Detrás de escena del equipo de desarrollo o soporte',
                                   'Problemas comunes que la tecnología ayuda a resolver'],
                'recommended_tone': 'profesional, moderno, claro y accesible',
                'audience': 'empresarios, emprendedores, equipos de trabajo y personas que buscan '
                            'soluciones tecnológicas para optimizar su negocio o vida diaria',
                'content_formats': ['carousel educativo',
                                    'reel demostrativo',
                                    'post de caso de éxito',
                                    'video corto explicativo',
                                    'comparativa antes vs después',
                                    'tips rápidos de productividad'],
                'keywords': ['tecnología',
                             'software',
                             'innovación',
                             'automatización',
                             'digitalización',
                             'productividad',
                             'infraestructura',
                             'cloud',
                             'apps',
                             'desarrollo',
                             'sistemas',
                             'ciberseguridad']}},
 {'name': 'SaaS & Marketing con IA',
  'slug': 'saas-marketing-ia',
  'subcategories': [
      {'name': 'SaaS / Marketing de contenidos con IA', 'slug': 'saas-contenidos-ia'},
      {'name': 'Gestión de Redes Sociales (SMMA)', 'slug': 'smma'},
      {'name': 'Agencia de Marketing Digital', 'slug': 'agencia-mkt-digital-ia'},
      {'name': 'Community Manager', 'slug': 'community-manager'},
      {'name': 'Plataforma de IA / No-Code', 'slug': 'plataforma-ia'},
      {'name': 'Consultoría en Transformación Digital', 'slug': 'transformacion-digital'},
      {'name': 'Agentes IA', 'slug': 'agentes-ia'},
      {'name': 'Automatización con IA', 'slug': 'automatizacion-ia'},
      {'name': 'Chatbots', 'slug': 'chatbots'},
      {'name': 'Automatización de Ventas', 'slug': 'automatizacion-ventas'},
      {'name': 'CRM & Embudos', 'slug': 'crm-embudos'}
  ],
  'aiContext': {'description': 'Plataformas SaaS, agencias y consultoras que usan Inteligencia '
                               'Artificial para crear contenido, gestionar redes sociales y '
                               'automatizar el marketing digital de sus clientes.',
                'content_topics': ['Cómo la IA ahorra tiempo en la creación de contenido',
                                   'Resultados reales de clientes que usan IA en su marketing',
                                   'Tips rápidos para gestionar redes sociales con IA',
                                   'Casos de éxito: negocios que escalaron con automatización',
                                   'Diferencia entre publicar manualmente vs usar IA',
                                   'Tendencias de marketing con IA para pequeñas empresas',
                                   'Por qué la consistencia en redes sociales genera ventas',
                                   'Cómo crear 30 posts en minutos con IA'],
                'recommended_tone': 'profesional y cercano, con lenguaje tech accesible para '
                                    'no-técnicos',
                'audience': 'emprendedores, dueños de negocios y marketers que quieren hacer '
                            'crecer su presencia digital con IA',
                'content_formats': ['carousel educativo',
                                    'reel de tip rápido',
                                    'post de caso de éxito',
                                    'antes y después',
                                    'comparativa manual vs IA'],
                'keywords': ['IA',
                             'inteligencia artificial',
                             'automatización',
                             'marketing digital',
                             'redes sociales',
                             'SaaS',
                             'contenido',
                             'eficiencia']}},
{'name': 'Energía Solar',
  'slug': 'energia-solar',
  'subcategories': [{'name': 'Instalación Residencial', 'slug': 'solar-residencial'},
                    {'name': 'Instalación Comercial', 'slug': 'solar-comercial'},
                    {'name': 'Instalación Industrial', 'slug': 'solar-industrial'},
                    {'name': 'Instalación Agrícola', 'slug': 'solar-agricola'},
                    {'name': 'Parques Solares', 'slug': 'parques-solares'},
                    {'name': 'Mantenimiento Solar', 'slug': 'solar-mantenimiento'},
                    {'name': 'Asesoría Energética', 'slug': 'solar-asesoria'},
                    {'name': 'Bombeo Solar', 'slug': 'bombeo-solar'},
                    {'name': 'Solar Off Grid', 'slug': 'solar-offgrid'},
                    {'name': 'Respaldo Energético & Baterías', 'slug': 'solar-baterias'},
                    {'name': 'Eficiencia Energética', 'slug': 'eficiencia-energetica'}],
  'aiContext': {'description': 'Empresas de energía solar y soluciones energéticas que ayudan a '
                               'hogares, negocios, industrias y proyectos agrícolas a reducir '
                               'costos eléctricos, mejorar su sostenibilidad y generar ahorro a '
                               'largo plazo mediante energía limpia.',
                'content_topics': ['Ahorro mensual en factura de energía',
                                   'Antes y después del consumo eléctrico',
                                   'Instalaciones solares en hogares y empresas',
                                   'Beneficios financieros y retorno de inversión',
                                   'Contenido educativo sobre energía solar',
                                   'Proceso de instalación paso a paso',
                                   'Testimonios de clientes y casos reales',
                                   'Mantenimiento y monitoreo de sistemas solares',
                                   'Sostenibilidad y reducción de huella de carbono',
                                   'Parques solares y proyectos de gran escala'],
                'recommended_tone': 'profesional, confiable, moderno y orientado a ahorro',
                'audience': 'hogares, empresas, industrias, hoteles, fincas y personas '
                            'interesadas en reducir costos energéticos y adoptar energía limpia',
                'content_formats': ['reel de instalación',
                                    'carousel educativo',
                                    'antes y después de factura',
                                    'video drone de proyecto solar',
                                    'testimonio de cliente',
                                    'contenido explicativo'],
                'keywords': ['energía solar',
                             'paneles solares',
                             'ahorro energético',
                             'factura de luz',
                             'energía limpia',
                             'sostenibilidad',
                             'instalación solar',
                             'energía renovable',
                             'parques solares',
                             'off grid',
                             'retorno de inversión']}},
 {'name': 'Inmobiliaria',
  'slug': 'inmobiliaria',
  'subcategories': [{'name': 'Venta de Vivienda Nueva', 'slug': 'vivienda-nueva'},
                    {'name': 'Venta de Usados', 'slug': 'vivienda-usada'},
                    {'name': 'Arriendo & Alquiler', 'slug': 'arriendo'},
                    {'name': 'Finca Raíz Comercial', 'slug': 'finca-raiz-comercial'},
                    {'name': 'Finca & Lotes', 'slug': 'finca-lotes'}],
  'aiContext': {'description': 'Agentes y empresas inmobiliarias que ayudan a personas y empresas '
                               'a comprar, vender o arrendar propiedades residenciales y '
                               'comerciales.',
                'content_topics': ['Propiedades disponibles en venta o arriendo',
                                   'Tips para comprar tu primera vivienda',
                                   'Tendencias del mercado inmobiliario local',
                                   'Consejos de decoración e inversión en propiedad raíz',
                                   'Testimonios de clientes que encontraron su hogar ideal',
                                   'Comparación de zonas y barrios para vivir o invertir'],
                'recommended_tone': 'confiable y aspiracional, con datos concretos y cercanía '
                                    'emocional',
                'audience': 'familias y parejas buscando vivienda, inversionistas y empresas en '
                            'búsqueda de locales o bodegas',
                'content_formats': ['post de propiedad destacada',
                                    'carousel de comparativa de zonas',
                                    'reel de recorrido virtual',
                                    'infografía de tips de compra'],
                'keywords': ['inmobiliaria',
                             'vivienda',
                             'propiedad',
                             'apartamento',
                             'casa',
                             'inversión',
                             'finca raíz']}},
{'name': 'Construcción & Remodelación',
  'slug': 'construccion',
  'subcategories': [{'name': 'Constructora', 'slug': 'constructora'},
                    {'name': 'Remodelación Residencial', 'slug': 'remodelacion-residencial'},
                    {'name': 'Remodelación Comercial', 'slug': 'remodelacion-comercial'},
                    {'name': 'Drywall & Cielo Raso', 'slug': 'drywall-cielo-raso'},
                    {'name': 'Pintura & Acabados', 'slug': 'pintura-acabados'},
                    {'name': 'Carpintería & Muebles a Medida', 'slug': 'carpinteria-medida'},
                    {'name': 'Cocinas Integrales', 'slug': 'cocinas-integrales'},
                    {'name': 'Baños & Remodelación', 'slug': 'banos-remodelacion'},
                    {'name': 'Pisos & Revestimientos', 'slug': 'pisos-revestimientos'},
                    {'name': 'Electricidad & Automatización', 'slug': 'electricidad-automatizacion'},
                    {'name': 'Plomería & Redes Hidráulicas', 'slug': 'plomeria-redes'},
                    {'name': 'Ferretería', 'slug': 'ferreteria'},
                    {'name': 'Paisajismo & Jardines', 'slug': 'paisajismo-jardines'},
                    {'name': 'Domótica Residencial', 'slug': 'domotica-residencial'}],
  'aiContext': {'description': 'Empresas constructoras, remodeladores y especialistas en acabados '
                               'que transforman espacios residenciales y comerciales mediante '
                               'diseño, funcionalidad y ejecución profesional.',
                'content_topics': ['Antes y después de remodelaciones',
                                   'Transformación de espacios',
                                   'Proceso de construcción o instalación',
                                   'Acabados premium y detalles visuales',
                                   'Consejos para remodelar hogares o negocios',
                                   'Tendencias modernas en diseño y construcción',
                                   'Errores comunes y soluciones prácticas',
                                   'Testimonios de clientes satisfechos',
                                   'Recorridos de proyectos terminados',
                                   'Materiales y calidad de construcción'],
                'recommended_tone': 'profesional, visual, confiable y aspiracional',
                'audience': 'personas y empresas interesadas en construir, remodelar o mejorar '
                            'espacios residenciales, comerciales o corporativos',
                'content_formats': ['antes y después',
                                    'reel de transformación',
                                    'tour de proyecto',
                                    'carousel de acabados',
                                    'video de proceso',
                                    'testimonio de cliente'],
                'keywords': ['construcción',
                             'remodelación',
                             'acabados',
                             'hogar',
                             'diseño',
                             'arquitectura',
                             'drywall',
                             'cocinas',
                             'smart home',
                             'espacios',
                             'obra',
                             'transformación']}},
{'name': 'Automotriz & Vehículos',
  'slug': 'automotriz',
  'subcategories': [{'name': 'Concesionario', 'slug': 'concesionario'},
                    {'name': 'Compra & Venta de Vehículos', 'slug': 'compra-venta-vehiculos'},
                    {'name': 'Taller Mecánico', 'slug': 'taller-mecanico'},
                    {'name': 'Mecánica Especializada', 'slug': 'mecanica-especializada'},
                    {'name': 'Venta de Repuestos', 'slug': 'venta-repuestos'},
                    {'name': 'Lavado Premium & Detailing', 'slug': 'detailing'},
                    {'name': 'Polarizados & PPF', 'slug': 'polarizados-ppf'},
                    {'name': 'Tuning & Performance', 'slug': 'tuning-performance'},
                    {'name': 'Audio Car', 'slug': 'audio-car'},
                    {'name': 'Accesorios Off Road', 'slug': 'offroad'},
                    {'name': 'Motos & Accesorios', 'slug': 'motos-accesorios'},
                    {'name': 'Vehículos Eléctricos', 'slug': 'vehiculos-electricos'},
                    {'name': 'Renta de Vehículos', 'slug': 'renta-vehiculos'}],
  'aiContext': {'description': 'Negocios automotrices, talleres, concesionarios y marcas '
                               'relacionadas con vehículos que venden rendimiento, estilo, '
                               'tecnología, mantenimiento y experiencia de conducción.',
                'content_topics': ['Antes y después de detailing o modificaciones',
                                   'Tips de mantenimiento y cuidado del vehículo',
                                   'Presentación de vehículos destacados',
                                   'Sonido, potencia y performance',
                                   'Accesorios y personalización',
                                   'Contenido aspiracional y lifestyle automotriz',
                                   'Testimonios de clientes satisfechos',
                                   'Comparativas de vehículos o productos',
                                   'Tecnología y tendencias automotrices',
                                   'Reels cinematográficos de vehículos'],
                'recommended_tone': 'moderno, aspiracional, energético y visual',
                'audience': 'personas apasionadas por carros, motos, performance, estética '
                            'automotriz y tecnología vehicular',
                'content_formats': ['reel cinematográfico',
                                    'antes y después',
                                    'video POV',
                                    'carousel de transformación',
                                    'testimonio de cliente',
                                    'video de sonido o performance'],
                'keywords': ['automotriz',
                             'carros',
                             'motos',
                             'detailing',
                             'performance',
                             'tuning',
                             'vehículos',
                             'motor',
                             'offroad',
                             'polarizado',
                             'accesorios',
                             'car lifestyle']}},
 {'name': 'Educación',
  'slug': 'educacion',
  'subcategories': [{'name': 'Clases Particulares', 'slug': 'clases-particulares'},
                    {'name': 'Academia de Idiomas', 'slug': 'academia-idiomas'},
                    {'name': 'Guardería & Preescolar', 'slug': 'guarderia-preescolar'},
                    {'name': 'Academia de Música', 'slug': 'academia-musica'},
                    {'name': 'Cursos Online', 'slug': 'cursos-online'},
                    {'name': 'Preparatoria Universitaria', 'slug': 'preparatoria-universitaria'},
                    {'name': 'Arte & Pintura', 'slug': 'arte-pintura'}],
  'aiContext': {'description': 'Academias, colegios, cursos y servicios educativos que forman '
                               'personas en diversas habilidades y conocimientos.',
                'content_topics': ['Metodologías de enseñanza y resultados de aprendizaje',
                                   'Historias de transformación de estudiantes',
                                   'Tips y consejos de estudio aplicables',
                                   'Fechas de inscripción, horarios y modalidades',
                                   'Por qué invertir en educación es la mejor decisión',
                                   'Testimonios de egresados y padres de familia'],
                'recommended_tone': 'motivador y cercano, con autoridad académica pero sin rigidez',
                'audience': 'estudiantes, padres de familia y profesionales en búsqueda de '
                            'formación y desarrollo',
                'content_formats': ['carousel de tips',
                                    'reel de testimonios',
                                    'post de resultados',
                                    'infografía de metodología'],
                'keywords': ['educación',
                             'aprendizaje',
                             'formación',
                             'cursos',
                             'enseñanza',
                             'conocimiento']}},
{'name': 'Agricultura & Agro',
  'slug': 'agro',
  'subcategories': [{'name': 'Agricultura de Precisión', 'slug': 'agricultura-precision'},
                    {'name': 'Finca & Cultivos', 'slug': 'finca-cultivos'},
                    {'name': 'Cultivos Hidropónicos', 'slug': 'hidroponia'},
                    {'name': 'Agroinsumos', 'slug': 'agroinsumos'},
                    {'name': 'Vivero & Plantas', 'slug': 'vivero-plantas'},
                    {'name': 'Ganadería', 'slug': 'ganaderia'},
                    {'name': 'Lechería & Producción Láctea', 'slug': 'lecheria'},
                    {'name': 'Avicultura', 'slug': 'avicultura'},
                    {'name': 'Porcicultura', 'slug': 'porcicultura'},
                    {'name': 'Acuicultura & Pesca', 'slug': 'acuicultura'},
                    {'name': 'Riego & Automatización Agrícola', 'slug': 'riego-automatizacion'},
                    {'name': 'Maquinaria Agrícola', 'slug': 'maquinaria-agricola'},
                    {'name': 'Exportación Agroindustrial', 'slug': 'exportacion-agro'},
                    {'name': 'Agroindustria', 'slug': 'agroindustria'},
                    {'name': 'Producción Orgánica', 'slug': 'produccion-organica'}],
  'aiContext': {'description': 'Empresas agrícolas, fincas, agroindustrias y productores que '
                               'trabajan en cultivos, ganadería y producción alimentaria usando '
                               'tecnología, sostenibilidad y productividad para crecer y vender '
                               'más.',
                'content_topics': ['Procesos de cultivo y producción agrícola',
                                   'Tecnología e innovación en el agro',
                                   'Tips de productividad y eficiencia',
                                   'Cuidado de cultivos y animales',
                                   'Sistemas de riego y automatización',
                                   'Historias de productores y trabajo en campo',
                                   'Sostenibilidad y agricultura responsable',
                                   'Antes y después de procesos agrícolas',
                                   'Maquinaria y herramientas agrícolas',
                                   'Exportación y calidad de productos'],
                'recommended_tone': 'profesional, cercano, confiable y enfocado en productividad',
                'audience': 'productores, empresarios agroindustriales, agricultores, ganaderos '
                            'y personas interesadas en innovación y productividad agrícola',
                'content_formats': ['reel de campo',
                                    'video drone agrícola',
                                    'carousel educativo',
                                    'tips rápidos',
                                    'antes y después',
                                    'testimonio de productor'],
                'keywords': ['agro',
                             'campo',
                             'cultivos',
                             'ganadería',
                             'riego',
                             'productividad',
                             'agricultura',
                             'agroindustria',
                             'finca',
                             'producción',
                             'sostenibilidad',
                             'tecnología agrícola']}},
{'name': 'Arquitectura & Espacios',
  'slug': 'arquitectura',
  'subcategories': [{'name': 'Arquitectura Residencial', 'slug': 'arquitectura-residencial'},
                    {'name': 'Arquitectura Comercial', 'slug': 'arquitectura-comercial'},
                    {'name': 'Diseño Interior', 'slug': 'diseno-interior'},
                    {'name': 'Renderizado 3D', 'slug': 'render-3d'},
                    {'name': 'Diseño de Oficinas', 'slug': 'diseno-oficinas'},
                    {'name': 'Interiorismo Premium', 'slug': 'interiorismo-premium'},
                    {'name': 'Paisajismo Arquitectónico', 'slug': 'paisajismo-arquitectonico'},
                    {'name': 'Arquitectura Sostenible', 'slug': 'arquitectura-sostenible'},
                    {'name': 'Tiny Homes & Modular', 'slug': 'tiny-homes'},
                    {'name': 'Visualización Arquitectónica', 'slug': 'visualizacion-arquitectonica'}],
  'aiContext': {'description': 'Arquitectos, estudios de diseño, interioristas y especialistas en '
                               'espacios residenciales y comerciales que transforman ambientes '
                               'mediante diseño, funcionalidad, estética y experiencias visuales.',
                'content_topics': ['Antes y después de espacios',
                                   'Tours arquitectónicos y recorridos visuales',
                                   'Renderizados y visualización 3D',
                                   'Diseño interior y decoración premium',
                                   'Tendencias modernas en arquitectura y espacios',
                                   'Optimización de espacios pequeños',
                                   'Proceso creativo y conceptualización',
                                   'Materiales, iluminación y acabados',
                                   'Historias detrás de cada proyecto',
                                   'Lifestyle y experiencia de vivir un espacio'],
                'recommended_tone': 'elegante, visual, aspiracional y profesional',
                'audience': 'personas y empresas interesadas en diseño, arquitectura, remodelación, '
                            'interiorismo y espacios modernos funcionales',
                'content_formats': ['tour visual',
                                    'reel cinematográfico',
                                    'antes y después',
                                    'carousel de diseño',
                                    'render 3D',
                                    'video lifestyle arquitectónico'],
                'keywords': ['arquitectura',
                             'diseño interior',
                             'render',
                             'espacios',
                             'interiorismo',
                             'decoración',
                             'arquitecto',
                             'lifestyle',
                             'hogar',
                             'visualización 3D',
                             'acabados',
                             'arquitectura moderna']}},
{
    'name': 'Arte & Diseño Creativo',
    'slug': 'arte',

    'subcategories': [
        {'name': 'Estudio de Diseño', 'slug': 'estudio-diseno'},
        {'name': 'Diseño Gráfico', 'slug': 'diseno-grafico'},
        {'name': 'Branding & Identidad Visual', 'slug': 'branding-identidad'},
        {'name': 'Diseño Editorial', 'slug': 'diseno-editorial'},
        {'name': 'Ilustración', 'slug': 'ilustracion'},
        {'name': 'Arte Digital', 'slug': 'arte-digital'},
        {'name': 'Fotografía Artística', 'slug': 'fotografia-artistica'},
        {'name': 'Fotografía de Producto', 'slug': 'fotografia-producto'},
        {'name': 'Galería de Arte', 'slug': 'galeria-arte'},
        {'name': 'Artesanías', 'slug': 'artesanias'},
        {'name': 'Lettering & Caligrafía', 'slug': 'lettering-caligrafia'},
        {'name': 'Diseño UX/UI', 'slug': 'ux-ui'},
        {'name': 'Animación & Motion Graphics', 'slug': 'motion-graphics'},
        {'name': 'Diseño para Redes Sociales', 'slug': 'diseno-redes-sociales'}
    ],

    'aiContext': {
        'description': 'Artistas, diseñadores, estudios creativos y marcas visuales que ayudan a personas y empresas a comunicar emociones, identidad y estilo mediante diseño, ilustración, fotografía y creatividad visual.',

        'content_topics': [
            'Proceso creativo y detrás de escena',
            'Antes y después de diseños y proyectos',
            'Inspiración artística y tendencias visuales',
            'Branding e identidad visual para marcas',
            'Transformación visual de negocios y productos',
            'Técnicas de diseño e ilustración',
            'Portafolio y proyectos destacados',
            'Arte digital, fotografía y composición',
            'Historias detrás de cada creación',
            'Creatividad aplicada a marcas y contenido'
        ],

        'recommended_tone': 'visual, creativo, moderno e inspirador',

        'audience': 'personas, marcas y empresas interesadas en diseño, arte, creatividad, branding y contenido visual de alto impacto',

        'content_formats': [
            'reel creativo',
            'timelapse de diseño',
            'antes y después',
            'carousel visual',
            'video behind the scenes',
            'portafolio animado',
            'story de inspiración'
        ],

        'keywords': [
            'diseño',
            'arte',
            'branding',
            'creatividad',
            'identidad visual',
            'fotografía',
            'ilustración',
            'ux ui',
            'motion graphics',
            'contenido visual',
            'estética',
            'diseño gráfico',
            'arte digital',
            'portafolio'
        ]
    }
},
{
    'name': 'Cadena Fría & Refrigeración',
  'slug': 'cadena-fria',
  'subcategories': [{'name': 'Cuartos Fríos', 'slug': 'cuartos-frios'},
                    {'name': 'Refrigeración Comercial', 'slug': 'refrigeracion-comercial'},
                    {'name': 'Refrigeración Industrial', 'slug': 'refrigeracion-industrial'},
                    {'name': 'Aire Acondicionado Comercial', 'slug': 'aire-acondicionado-comercial'},
                    {'name': 'HVAC Industrial', 'slug': 'hvac-industrial'},
                    {'name': 'Equipos de Refrigeración', 'slug': 'equipos-refrigeracion'},
                    {'name': 'Cadena de Frío Alimentaria', 'slug': 'cadena-frio-alimentos'},
                    {'name': 'Refrigeración para Restaurantes', 'slug': 'refrigeracion-restaurantes'},
                    {'name': 'Refrigeración para Supermercados', 'slug': 'refrigeracion-supermercados'},
                    {'name': 'Mantenimiento Preventivo HVAC', 'slug': 'mantenimiento-hvac'},
                    {'name': 'Monitoreo & Control de Temperatura', 'slug': 'monitoreo-temperatura'},
                    {'name': 'Refrigeración Farmacéutica', 'slug': 'refrigeracion-farmaceutica'}],
  'aiContext': {'description': 'Empresas de refrigeración, cadena fría y climatización que ayudan '
                               'a negocios e industrias a conservar productos, mantener operaciones '
                               'estables y optimizar consumo energético mediante sistemas de frío '
                               'y control térmico.',
                'content_topics': ['Instalaciones de cuartos fríos y sistemas HVAC',
                                   'Mantenimiento preventivo y correctivo',
                                   'Ahorro energético y eficiencia operativa',
                                   'Conservación segura de alimentos y medicamentos',
                                   'Monitoreo y control de temperatura',
                                   'Casos de éxito industriales y comerciales',
                                   'Proceso de instalación y operación',
                                   'Tips para evitar pérdidas por temperatura',
                                   'Tecnología e innovación en refrigeración',
                                   'Continuidad operativa y productividad'],
                'recommended_tone': 'profesional, técnico, confiable y orientado a eficiencia',
                'audience': 'restaurantes, supermercados, industrias, clínicas, laboratorios y '
                            'empresas que necesitan conservar productos y mantener operaciones '
                            'seguras y eficientes',
                'content_formats': ['reel técnico',
                                    'video de instalación',
                                    'carousel educativo',
                                    'antes y después',
                                    'caso de éxito',
                                    'video explicativo'],
                'keywords': ['cadena fría',
                             'refrigeración',
                             'hvac',
                             'cuartos fríos',
                             'aire acondicionado',
                             'temperatura',
                             'conservación',
                             'eficiencia energética',
                             'frío industrial',
                             'mantenimiento',
                             'climatización',
                             'productividad']}},
{
    'name': 'Club & Membresías',
    'slug': 'club',

    'subcategories': [
        {'name': 'Club Empresarial', 'slug': 'club-empresarial'},
        {'name': 'Red de Referidos', 'slug': 'red-referidos'},
        {'name': 'Franquicia', 'slug': 'franquicia'},
        {'name': 'Asociación Gremial', 'slug': 'asociacion-gremial'},
        {'name': 'Comunidad & Networking', 'slug': 'comunidad-networking'},
        {'name': 'Club Privado', 'slug': 'club-privado'},
        {'name': 'Membresías Premium', 'slug': 'membresias-premium'},
        {'name': 'Comunidad Educativa', 'slug': 'comunidad-educativa'},
        {'name': 'Mastermind & Mentoring', 'slug': 'mastermind-mentoring'},
        {'name': 'Club Deportivo', 'slug': 'club-deportivo'},
        {'name': 'Club Social', 'slug': 'club-social'},
        {'name': 'Networking Empresarial', 'slug': 'networking-empresarial'},
        {'name': 'Programa de Fidelización', 'slug': 'programa-fidelizacion'}
    ],

    'aiContext': {
        'description': 'Clubes, comunidades, membresías y redes empresariales que ayudan a personas y negocios a generar conexiones, crecimiento, aprendizaje y oportunidades mediante comunidad, networking y experiencias exclusivas.',

        'content_topics': [
            'Beneficios exclusivos para miembros',
            'Networking y conexiones estratégicas',
            'Eventos privados y experiencias premium',
            'Casos de éxito y testimonios de miembros',
            'Aprendizaje, mentorías y crecimiento',
            'Comunidad y sentido de pertenencia',
            'Historias de colaboración y negocios',
            'Ventajas de pertenecer al club o membresía',
            'Eventos, reuniones y masterminds',
            'Contenido aspiracional y lifestyle empresarial'
        ],

        'recommended_tone': 'exclusivo, profesional, cercano e inspirador',

        'audience': 'empresarios, emprendedores, profesionales y personas interesadas en networking, crecimiento personal y pertenecer a comunidades de valor',

        'content_formats': [
            'reel de evento',
            'video testimonial',
            'carousel de beneficios',
            'story de networking',
            'video lifestyle empresarial',
            'contenido de comunidad',
            'clip de mastermind'
        ],

        'keywords': [
            'club',
            'membresía',
            'networking',
            'comunidad',
            'empresarios',
            'negocios',
            'mastermind',
            'franquicia',
            'referidos',
            'crecimiento',
            'conexiones',
            'club privado',
            'fidelización',
            'comunidad premium'
        ]
    }
},
{
    'name': 'Comercio & Retail',
    'slug': 'retail',

    'subcategories': [
        {'name': 'Tienda de Variedades', 'slug': 'tienda-variedades'},
        {'name': 'Supermercado & Fruver', 'slug': 'supermercado'},
        {'name': 'Minimarket & Tienda de Barrio', 'slug': 'minimarket'},
        {'name': 'Papelería & Útiles', 'slug': 'papeleria'},
        {'name': 'Distribuidora', 'slug': 'distribuidora'},
        {'name': 'Mayorista & Proveedor', 'slug': 'mayorista'},
        {'name': 'Licorera & Bebidas', 'slug': 'licorera-bebidas'},
        {'name': 'Tienda de Conveniencia', 'slug': 'tienda-conveniencia'},
        {'name': 'Productos Importados', 'slug': 'productos-importados'},
        {'name': 'Bazar & Hogar', 'slug': 'bazar-hogar'},
        {'name': 'Tienda Multi-producto', 'slug': 'tienda-multiproducto'},
        {'name': 'Retail Tecnológico', 'slug': 'retail-tecnologico'},
        {'name': 'Retail Premium', 'slug': 'retail-premium'}
    ],

    'aiContext': {
        'description': 'Tiendas, distribuidores, supermercados y negocios retail que venden productos físicos al consumidor mediante promociones, experiencia de compra, variedad y contenido orientado a tráfico y ventas.',

        'content_topics': [
            'Productos más vendidos y novedades',
            'Promociones, descuentos y combos',
            'Experiencia de compra y atención al cliente',
            'Productos virales y tendencias',
            'Tips de uso y recomendaciones',
            'Comparativas de productos',
            'Contenido estacional y fechas especiales',
            'Organización de tienda y exhibición visual',
            'Clientes felices y testimonios',
            'Ofertas relámpago y urgencia comercial'
        ],

        'recommended_tone': 'comercial, dinámico, cercano y orientado a conversión',

        'audience': 'personas y familias que buscan productos útiles, buenos precios, variedad y compras rápidas y confiables',

        'content_formats': [
            'reel de productos',
            'carousel de promociones',
            'video tipo oferta viral',
            'story de descuento',
            'video de tienda',
            'UGC de cliente',
            'contenido tipo TikTok retail'
        ],

        'keywords': [
            'retail',
            'ofertas',
            'promociones',
            'productos',
            'supermercado',
            'descuentos',
            'compras',
            'tienda',
            'variedad',
            'ventas',
            'clientes',
            'consumo'
        ]
    }
},
{
        'name': 'Ecommerce & Tiendas Online',
  'slug': 'ecommerce',
  'subcategories': [{'name': 'Tienda Online', 'slug': 'tienda-online'},
                    {'name': 'Shopify Store', 'slug': 'shopify-store'},
                    {'name': 'TikTok Shop', 'slug': 'tiktok-shop'},
                    {'name': 'Marketplace', 'slug': 'marketplace'},
                    {'name': 'Amazon FBA', 'slug': 'amazon-fba'},
                    {'name': 'Dropshipping', 'slug': 'dropshipping'},
                    {'name': 'Print On Demand', 'slug': 'print-on-demand'},
                    {'name': 'Productos Virales', 'slug': 'productos-virales'},
                    {'name': 'Moda Online', 'slug': 'moda-online'},
                    {'name': 'Beauty Ecommerce', 'slug': 'beauty-ecommerce'},
                    {'name': 'Skincare Ecommerce', 'slug': 'skincare-ecommerce'},
                    {'name': 'Suplementos Ecommerce', 'slug': 'suplementos-ecommerce'},
                    {'name': 'Mascotas Ecommerce', 'slug': 'mascotas-ecommerce'},
                    {'name': 'Hogar & Decoración Ecommerce', 'slug': 'hogar-ecommerce'},
                    {'name': 'Gadgets & Tecnología Ecommerce', 'slug': 'gadgets-ecommerce'},
                    {'name': 'Joyería Ecommerce', 'slug': 'joyeria-ecommerce'},
                    {'name': 'Social Commerce', 'slug': 'social-commerce'},
                    {'name': 'Marca DTC', 'slug': 'marca-dtc'}],
  'aiContext': {'description': 'Tiendas online, marcas ecommerce y negocios digitales que venden '
                               'productos físicos o digitales usando redes sociales, contenido '
                               'viral y estrategias de conversión para generar ventas constantes.',
                'content_topics': ['Productos más vendidos y demostraciones rápidas',
                                   'Contenido viral orientado a conversión',
                                   'Problemas que el producto resuelve',
                                   'Testimonios y reseñas de clientes',
                                   'Ofertas limitadas y promociones especiales',
                                   'Experiencia de unboxing y empaque',
                                   'Comparativas antes vs después',
                                   'Tendencias de TikTok Shop y social commerce',
                                   'Videos tipo UGC mostrando el producto en uso',
                                   'Lanzamientos de productos y drops exclusivos'],
                'recommended_tone': 'dinámico, comercial, persuasivo y orientado a conversión',
                'audience': 'personas que compran online impulsadas por contenido visual, ofertas, '
                            'recomendaciones y tendencias en redes sociales',
                'content_formats': ['UGC demostrativo',
                                    'reel viral de producto',
                                    'carousel de beneficios',
                                    'video tipo TikTok Shop',
                                    'story con CTA de compra',
                                    'video de unboxing'],
                'keywords': ['ecommerce',
                             'ventas online',
                             'tienda virtual',
                             'shopify',
                             'tiktok shop',
                             'dropshipping',
                             'productos virales',
                             'social commerce',
                             'comprar online',
                             'oferta',
                             'envíos',
                             'ugc',
                             'conversión']}},
{    
    'name': 'Consultoría & Servicios Profesionales',
    'slug': 'consultoria',

    'subcategories': [
        {'name': 'Consultoría Empresarial', 'slug': 'consultoria-empresarial'},
        {'name': 'Recursos Humanos & Reclutamiento', 'slug': 'rrhh'},
        {'name': 'Gestión de Proyectos', 'slug': 'gestion-proyectos'},
        {'name': 'Auditoría', 'slug': 'auditoria'},
        {'name': 'Consultoría Estratégica', 'slug': 'consultoria-estrategica'},
        {'name': 'Business Coaching', 'slug': 'business-coaching'},
        {'name': 'Outsourcing Empresarial', 'slug': 'outsourcing-empresarial'},
        {'name': 'Optimización de Procesos', 'slug': 'optimizacion-procesos'},
        {'name': 'Consultoría Comercial & Ventas', 'slug': 'consultoria-ventas'},
        {'name': 'Transformación Digital Empresarial', 'slug': 'transformacion-digital-empresarial'},
        {'name': 'Capacitación Corporativa', 'slug': 'capacitacion-corporativa'},
        {'name': 'Consultoría Financiera Empresarial', 'slug': 'consultoria-financiera-empresarial'}
    ],

    'aiContext': {
        'description': 'Consultores, asesores y firmas profesionales que ayudan a empresas y emprendedores a crecer, optimizar operaciones, aumentar ventas y tomar mejores decisiones estratégicas.',

        'content_topics': [
            'Errores comunes en negocios y cómo solucionarlos',
            'Optimización y eficiencia empresarial',
            'Crecimiento comercial y ventas',
            'Transformación digital y automatización',
            'Liderazgo y productividad',
            'Casos de éxito empresariales',
            'Consejos prácticos para emprendedores',
            'Estrategia, organización y escalabilidad',
            'Capacitación y cultura organizacional',
            'Tendencias empresariales y competitividad'
        ],

        'recommended_tone': 'profesional, estratégico, confiable y orientado a resultados',

        'audience': 'empresarios, emprendedores, gerentes y equipos que buscan crecer, vender más y mejorar la operación de sus negocios',

        'content_formats': [
            'carousel educativo',
            'reel explicativo',
            'caso de éxito',
            'tips empresariales rápidos',
            'video de autoridad',
            'preguntas frecuentes',
            'story con CTA'
        ],

        'keywords': [
            'consultoría',
            'negocios',
            'estrategia',
            'ventas',
            'empresas',
            'productividad',
            'optimización',
            'crecimiento',
            'liderazgo',
            'transformación digital',
            'emprendedores',
            'resultados'
        ]
    }
},
{
    'name': 'Creadores de Contenido & Influencers',
  'slug': 'creadores-contenido',
  'subcategories': [{'name': 'Influencer', 'slug': 'influencer'},
                    {'name': 'Creador UGC', 'slug': 'ugc'},
                    {'name': 'Streamer', 'slug': 'streamer'},
                    {'name': 'YouTuber', 'slug': 'youtuber'},
                    {'name': 'TikTok Creator', 'slug': 'tiktok-creator'},
                    {'name': 'Podcast', 'slug': 'podcast'},
                    {'name': 'Marca Personal', 'slug': 'marca-personal'},
                    {'name': 'Educador Digital', 'slug': 'educador-digital'},
                    {'name': 'Coach & Mentor', 'slug': 'coach-mentor'},
                    {'name': 'Lifestyle Creator', 'slug': 'lifestyle-creator'},
                    {'name': 'Gaming Creator', 'slug': 'gaming-creator'},
                    {'name': 'Travel Creator', 'slug': 'travel-creator'}],
  'aiContext': {'description': 'Creadores digitales, influencers, streamers, marcas personales y '
                               'educadores que viven de su audiencia, contenido y comunidad en '
                               'redes sociales.',
                'content_topics': ['Hooks virales y contenido de alto engagement',
                                   'Storytelling personal y experiencias reales',
                                   'Tips rápidos y contenido educativo',
                                   'Behind the scenes del día a día del creador',
                                   'Opiniones, tendencias y reacciones',
                                   'Construcción de marca personal',
                                   'Cómo crecer audiencia y comunidad',
                                   'Contenido UGC y colaboraciones con marcas',
                                   'Monetización, productividad y creación constante',
                                   'Preguntas y respuestas con la audiencia'],
                'recommended_tone': 'auténtico, cercano, dinámico y con personalidad fuerte',
                'audience': 'personas que consumen contenido en redes sociales buscando '
                            'entretenimiento, inspiración, aprendizaje o conexión con creadores',
                'content_formats': ['reel corto viral',
                                    'storytelling vertical',
                                    'UGC',
                                    'podcast clips',
                                    'carousel educativo',
                                    'live snippets',
                                    'contenido POV'],
                'keywords': ['contenido',
                             'influencer',
                             'ugc',
                             'marca personal',
                             'audiencia',
                             'viral',
                             'engagement',
                             'creator',
                             'reels',
                             'streamer',
                             'podcast',
                             'hooks']}
},
{
    'name': 'Electrónica & Electrodomésticos',
    'slug': 'electronica',

    'subcategories': [
        {'name': 'Tienda de Electrónica', 'slug': 'tienda-electronica'},
        {'name': 'Electrodomésticos para el Hogar', 'slug': 'electrodomesticos-hogar'},
        {'name': 'Reparación de Electrodomésticos', 'slug': 'reparacion-electrodomesticos'},
        {'name': 'Audio & Video', 'slug': 'audio-video'},
        {'name': 'Celulares & Accesorios', 'slug': 'celulares-accesorios'},
        {'name': 'Gaming & Consolas', 'slug': 'gaming-consolas'},
        {'name': 'Computadores & Laptops', 'slug': 'computadores-laptops'},
        {'name': 'Smart Home & Domótica', 'slug': 'smart-home'},
        {'name': 'Cámaras & Seguridad Electrónica', 'slug': 'camaras-seguridad'},
        {'name': 'Accesorios Tecnológicos', 'slug': 'accesorios-tecnologicos'},
        {'name': 'Servicio Técnico Electrónico', 'slug': 'servicio-tecnico-electronico'},
        {'name': 'Gadgets & Tecnología', 'slug': 'gadgets-tecnologia'},
        {'name': 'Electrónica Premium', 'slug': 'electronica-premium'}
    ],

    'aiContext': {
        'description': 'Tiendas de tecnología, electrónica y electrodomésticos que ayudan a personas y empresas a mejorar comodidad, productividad, entretenimiento y conectividad mediante dispositivos y soluciones tecnológicas.',

        'content_topics': [
            'Productos tecnológicos más vendidos',
            'Demostraciones y funcionalidades',
            'Comparativas de dispositivos',
            'Tips tecnológicos y hacks',
            'Gaming, entretenimiento y productividad',
            'Unboxing y experiencia de producto',
            'Promociones y lanzamientos',
            'Antes y después de reparaciones',
            'Smart home y automatización',
            'Tecnología para el día a día'
        ],

        'recommended_tone': 'moderno, dinámico, tecnológico y comercial',

        'audience': 'personas interesadas en tecnología, entretenimiento, productividad y dispositivos electrónicos para hogar, trabajo o gaming',

        'content_formats': [
            'unboxing',
            'reel demostrativo',
            'video comparativo',
            'carousel de beneficios',
            'review rápida',
            'story de oferta',
            'video tipo TikTok tech'
        ],

        'keywords': [
            'tecnología',
            'electrónica',
            'gadgets',
            'gaming',
            'smart home',
            'celulares',
            'audio',
            'video',
            'electrodomésticos',
            'innovación',
            'productividad',
            'tecnología premium'
        ]
    }
},
{
    'name': 'Eventos & Entretenimiento',
    'slug': 'eventos',

    'subcategories': [
        {'name': 'Fotografía & Video', 'slug': 'fotografia-video'},
        {'name': 'Producción Audiovisual', 'slug': 'produccion-audiovisual'},
        {'name': 'DJ & Música en Vivo', 'slug': 'dj-musica'},
        {'name': 'Sonido & Iluminación', 'slug': 'sonido-iluminacion'},
        {'name': 'Pantallas LED & Producción', 'slug': 'pantallas-led'},
        {'name': 'Catering para Eventos', 'slug': 'catering-eventos'},
        {'name': 'Decoración de Eventos', 'slug': 'decoracion-eventos'},
        {'name': 'Animación & Entretenimiento', 'slug': 'animacion-entretenimiento'},
        {'name': 'Hora Loca & Shows', 'slug': 'hora-loca-shows'},
        {'name': 'Eventos Infantiles', 'slug': 'eventos-infantiles'},
        {'name': 'Wedding Planner', 'slug': 'wedding-planner'},
        {'name': 'Organización de Bodas', 'slug': 'bodas'},
        {'name': 'Eventos Corporativos', 'slug': 'eventos-corporativos'},
        {'name': 'Experiencias & Activaciones', 'slug': 'activaciones-marca'},
        {'name': 'Salón de Eventos', 'slug': 'salon-eventos'},
        {'name': 'Alquiler de Mobiliario', 'slug': 'alquiler-mobiliario'},
        {'name': 'Bar & Discoteca', 'slug': 'bar-discoteca'},
        {'name': 'Club Nocturno', 'slug': 'club-nocturno'},
        {'name': 'Festival & Conciertos', 'slug': 'festival-conciertos'},
        {'name': 'Karaoke & Entretenimiento', 'slug': 'karaoke-entretenimiento'},
        {'name': 'Renta de Equipos Audiovisuales', 'slug': 'renta-audiovisuales'}
    ],

    'aiContext': {
        'description': 'Empresas de eventos, entretenimiento y producción audiovisual que crean experiencias memorables mediante música, decoración, shows, bodas, fiestas y activaciones para marcas y personas.',

        'content_topics': [
            'Momentos memorables y reacciones reales de asistentes',
            'Antes y después del montaje de eventos',
            'Decoraciones, iluminación y ambientación',
            'Behind the scenes de producción y montaje',
            'Shows, DJs, artistas y entretenimiento en vivo',
            'Bodas, cumpleaños y eventos corporativos',
            'Experiencias emocionales y celebraciones',
            'Testimonios de clientes felices',
            'Eventos temáticos y activaciones de marca',
            'Contenido cinematográfico y viral de fiestas y eventos'
        ],

        'recommended_tone': 'emocional, energético, aspiracional y visual',

        'audience': 'personas, parejas, empresas y marcas que buscan crear experiencias memorables, celebraciones especiales y eventos impactantes',

        'content_formats': [
            'reel cinematográfico',
            'video aftermovie',
            'antes y después de montaje',
            'carousel de decoración',
            'story en vivo',
            'video emocional',
            'clip de fiesta o evento'
        ],

        'keywords': [
            'eventos',
            'entretenimiento',
            'fiesta',
            'bodas',
            'dj',
            'producción',
            'show',
            'experiencia',
            'celebración',
            'decoración',
            'música',
            'evento corporativo',
            'aftermovie',
            'activación'
        ]
    }
},
{
    'name': 'Finanzas & Seguros',
    'slug': 'finanzas',

    'subcategories': [
        {'name': 'Seguros', 'slug': 'seguros'},
        {'name': 'Seguros de Vida', 'slug': 'seguros-vida'},
        {'name': 'Seguros Médicos', 'slug': 'seguros-medicos'},
        {'name': 'Seguros Vehiculares', 'slug': 'seguros-vehiculares'},
        {'name': 'Seguros Empresariales', 'slug': 'seguros-empresariales'},
        {'name': 'Créditos & Préstamos', 'slug': 'creditos-prestamos'},
        {'name': 'Crédito Hipotecario', 'slug': 'credito-hipotecario'},
        {'name': 'Crédito Vehicular', 'slug': 'credito-vehicular'},
        {'name': 'Fintech & Créditos Digitales', 'slug': 'fintech-creditos'},
        {'name': 'Contabilidad', 'slug': 'contabilidad'},
        {'name': 'Outsourcing Contable', 'slug': 'outsourcing-contable'},
        {'name': 'Declaración de Renta', 'slug': 'declaracion-renta'},
        {'name': 'Asesoría Tributaria', 'slug': 'asesoria-tributaria'},
        {'name': 'Asesoría Financiera', 'slug': 'asesoria-financiera'},
        {'name': 'Planeación Financiera', 'slug': 'planeacion-financiera'},
        {'name': 'Inversiones & Bolsa', 'slug': 'inversiones-bolsa'},
        {'name': 'Trading & Forex', 'slug': 'trading-forex'},
        {'name': 'Cripto & Activos Digitales', 'slug': 'cripto-activos'},
        {'name': 'Broker Financiero', 'slug': 'broker-financiero'}
    ],

    'aiContext': {
        'description': 'Empresas financieras, aseguradoras, contadores, brokers y asesores que ayudan a personas y negocios a proteger su patrimonio, acceder a financiamiento, optimizar impuestos y construir estabilidad financiera mediante soluciones confiables y estratégicas.',

        'content_topics': [
            'Errores financieros comunes y cómo evitarlos',
            'Protección financiera para familias y empresas',
            'Beneficios de estar asegurado',
            'Tips de ahorro, inversión y manejo financiero',
            'Educación financiera sencilla y práctica',
            'Casos reales de clientes y resultados',
            'Comparativas financieras y escenarios reales',
            'Consejos tributarios y contables',
            'Cómo acceder a créditos de manera inteligente',
            'Planeación financiera y libertad económica',
            'Actualidad económica y tendencias financieras',
            'Importancia de proteger patrimonio y estabilidad'
        ],

        'recommended_tone': 'profesional, confiable, claro y orientado a generar seguridad y autoridad',

        'audience': 'personas, familias, emprendedores y empresas que buscan proteger su patrimonio, mejorar su salud financiera, acceder a financiamiento o tomar mejores decisiones económicas',

        'content_formats': [
            'carousel educativo',
            'reel explicativo',
            'tips financieros rápidos',
            'caso de éxito',
            'comparativa antes/después',
            'preguntas frecuentes',
            'video educativo corto',
            'story con CTA'
        ],

        'keywords': [
            'finanzas',
            'seguros',
            'inversión',
            'ahorro',
            'crédito',
            'préstamo',
            'patrimonio',
            'contabilidad',
            'declaración de renta',
            'asesoría financiera',
            'libertad financiera',
            'protección financiera',
            'trading',
            'fintech',
            'broker',
            'impuestos',
            'seguridad económica'
        ]
    }
},
{
    'name': 'Hogar & Decoración',
    'slug': 'hogar',

    'subcategories': [
        {'name': 'Mueblería', 'slug': 'muebleria'},
        {'name': 'Muebles Premium', 'slug': 'muebles-premium'},
        {'name': 'Iluminación', 'slug': 'iluminacion'},
        {'name': 'Decoración Minimalista', 'slug': 'decoracion-minimalista'},
        {'name': 'Artículos de Decoración', 'slug': 'articulos-decoracion'},
        {'name': 'Lencería del Hogar', 'slug': 'lenceria-hogar'},
        {'name': 'Cocinas & Baños', 'slug': 'cocinas-banos'},
        {'name': 'Cortinas & Persianas', 'slug': 'cortinas-persianas'},
        {'name': 'Home Office & Espacios', 'slug': 'home-office'},
        {'name': 'Decoración Comercial', 'slug': 'decoracion-comercial'},
        {'name': 'Decoración Infantil', 'slug': 'decoracion-infantil'},
        {'name': 'Organización & Storage', 'slug': 'organizacion-storage'}
    ],

    'aiContext': {
        'description': 'Tiendas de hogar, decoración, mobiliario y diseño de espacios que ayudan a las personas a transformar sus ambientes mediante estilo, comodidad, organización y experiencias visuales modernas y funcionales.',

        'content_topics': [
            'Antes y después de espacios decorados',
            'Ideas modernas de decoración y diseño',
            'Tendencias de interiores y mobiliario',
            'Optimización y organización de espacios',
            'Iluminación y ambientes acogedores',
            'Decoración para hogares, oficinas y negocios',
            'Transformaciones de cocinas, baños y salas',
            'Tips de diseño y combinación de colores',
            'Experiencias visuales y lifestyle',
            'Productos destacados y nuevos lanzamientos'
        ],

        'recommended_tone': 'visual, elegante, inspirador y cercano',

        'audience': 'personas, familias y empresas interesadas en mejorar sus espacios, decoración y estilo de vida mediante diseño funcional y moderno',

        'content_formats': [
            'antes y después',
            'reel de transformación',
            'tour de espacios',
            'carousel de inspiración',
            'video lifestyle',
            'tips rápidos de decoración',
            'story de productos destacados'
        ],

        'keywords': [
            'hogar',
            'decoración',
            'muebles',
            'interiores',
            'diseño',
            'espacios',
            'iluminación',
            'home decor',
            'cocinas',
            'baños',
            'minimalismo',
            'organización',
            'lifestyle',
            'interiorismo'
        ]
    }
},
{
    'name': 'Industria & Manufactura',
    'slug': 'manufactura',

    'subcategories': [
        {'name': 'Fábrica & Planta', 'slug': 'fabrica-planta'},
        {'name': 'Metalúrgica', 'slug': 'metalurgica'},
        {'name': 'Fabricación Metálica', 'slug': 'fabricacion-metalica'},
        {'name': 'Plásticos & Caucho', 'slug': 'plasticos-caucho'},
        {'name': 'Textil Industrial', 'slug': 'textil-industrial'},
        {'name': 'Maquinaria & Equipos', 'slug': 'maquinaria-equipos'},
        {'name': 'Automatización Industrial', 'slug': 'automatizacion-industrial'},
        {'name': 'Empaque & Packaging', 'slug': 'empaque-packaging'},
        {'name': 'Producción Alimentaria', 'slug': 'produccion-alimentaria'},
        {'name': 'Ingeniería Industrial', 'slug': 'ingenieria-industrial'},
        {'name': 'Mantenimiento Industrial', 'slug': 'mantenimiento-industrial'},
        {'name': 'Soldadura & Estructuras', 'slug': 'soldadura-estructuras'},
        {'name': 'Control de Calidad', 'slug': 'control-calidad'},
        {'name': 'Bodegas & Producción', 'slug': 'bodegas-produccion'}
    ],

    'aiContext': {
        'description': 'Empresas industriales, manufactureras y de producción que fabrican productos, operan maquinaria y optimizan procesos mediante tecnología, ingeniería, calidad y eficiencia operativa.',

        'content_topics': [
            'Procesos de fabricación y producción',
            'Automatización y tecnología industrial',
            'Maquinaria, operación y eficiencia',
            'Control de calidad y productividad',
            'Seguridad industrial y buenas prácticas',
            'Behind the scenes de fábricas y plantas',
            'Innovación en manufactura',
            'Mantenimiento industrial y continuidad operativa',
            'Producción a gran escala y logística',
            'Casos de éxito y capacidad operativa'
        ],

        'recommended_tone': 'profesional, técnico, sólido y orientado a eficiencia y confianza',

        'audience': 'empresas, industrias, distribuidores y negocios que necesitan soluciones industriales, fabricación, maquinaria o procesos de producción confiables',

        'content_formats': [
            'reel industrial',
            'video operativo',
            'carousel técnico',
            'tour de planta',
            'caso de éxito',
            'video de maquinaria en acción',
            'tips industriales'
        ],

        'keywords': [
            'industria',
            'manufactura',
            'producción',
            'fábrica',
            'automatización',
            'ingeniería',
            'maquinaria',
            'metalúrgica',
            'procesos',
            'control de calidad',
            'eficiencia',
            'operación industrial',
            'packaging',
            'mantenimiento industrial'
        ]
    }
},
{
    'name': 'Joyería & Relojes',
    'slug': 'joyeria',

    'subcategories': [
        {'name': 'Joyería', 'slug': 'joyeria-fina'},
        {'name': 'Joyería de Lujo', 'slug': 'joyeria-lujo'},
        {'name': 'Joyería Personalizada', 'slug': 'joyeria-personalizada'},
        {'name': 'Anillos & Compromiso', 'slug': 'anillos-compromiso'},
        {'name': 'Relojería', 'slug': 'relojeria'},
        {'name': 'Relojería de Lujo', 'slug': 'relojeria-lujo'},
        {'name': 'Bisutería Fina', 'slug': 'bisuteria-fina'},
        {'name': 'Orfebrería', 'slug': 'orfebreria'},
        {'name': 'Accesorios Premium', 'slug': 'accesorios-premium'},
        {'name': 'Joyería Artesanal', 'slug': 'joyeria-artesanal'}
    ],

    'aiContext': {
        'description': 'Marcas de joyería, relojería y accesorios premium que ayudan a las personas a expresar estilo, elegancia, lujo y emociones mediante piezas exclusivas y experiencias memorables.',

        'content_topics': [
            'Piezas exclusivas y colecciones destacadas',
            'Anillos de compromiso y regalos especiales',
            'Detalles artesanales y procesos de creación',
            'Lujo, elegancia y estilo personal',
            'Historias emocionales detrás de cada joya',
            'Relojes premium y accesorios de lujo',
            'Combinaciones y tendencias de accesorios',
            'Regalos para fechas especiales',
            'Lifestyle premium y aspiracional',
            'Testimonios y experiencias de clientes'
        ],

        'recommended_tone': 'elegante, aspiracional, emocional y premium',

        'audience': 'personas interesadas en lujo, accesorios, moda, regalos especiales y piezas exclusivas para ocasiones importantes',

        'content_formats': [
            'reel cinematográfico',
            'video premium de producto',
            'carousel de colección',
            'story elegante',
            'video lifestyle',
            'unboxing premium',
            'fotografía de detalle'
        ],

        'keywords': [
            'joyería',
            'lujo',
            'anillos',
            'relojes',
            'elegancia',
            'accesorios',
            'diamantes',
            'premium',
            'regalos',
            'compromiso',
            'estilo',
            'moda',
            'joyas',
            'lifestyle'
        ]
    }
},
{
    'name': 'Legal & Jurídico',
    'slug': 'legal',

    'subcategories': [
        {'name': 'Abogado', 'slug': 'abogado'},
        {'name': 'Firma de Abogados', 'slug': 'firma-abogados'},
        {'name': 'Consultoría Legal', 'slug': 'consultoria-legal'},
        {'name': 'Notaría', 'slug': 'notaria'},
        {'name': 'Gestión de Trámites', 'slug': 'gestion-tramites'},
        {'name': 'Derecho Laboral', 'slug': 'derecho-laboral'},
        {'name': 'Derecho Civil', 'slug': 'derecho-civil'},
        {'name': 'Derecho Penal', 'slug': 'derecho-penal'},
        {'name': 'Derecho de Familia', 'slug': 'derecho-familia'},
        {'name': 'Derecho Empresarial', 'slug': 'derecho-empresarial'},
        {'name': 'Propiedad Intelectual', 'slug': 'propiedad-intelectual'},
        {'name': 'Migración & Visas', 'slug': 'migracion-visas'},
        {'name': 'Accidentes & Seguros', 'slug': 'accidentes-seguros'},
        {'name': 'Cobro Jurídico', 'slug': 'cobro-juridico'},
        {'name': 'Compliance & Protección de Datos', 'slug': 'compliance-datos'}
    ],

    'aiContext': {
        'description': 'Abogados, firmas legales, notarías y consultores jurídicos que ayudan a personas y empresas a proteger sus derechos, resolver conflictos, prevenir riesgos legales y tomar decisiones seguras mediante asesoría profesional y representación confiable.',

        'content_topics': [
            'Errores legales comunes y cómo evitarlos',
            'Derechos y obligaciones explicados de forma sencilla',
            'Consejos legales para personas y empresas',
            'Problemas legales frecuentes y soluciones prácticas',
            'Importancia de contratos y documentos bien elaborados',
            'Casos reales y aprendizajes jurídicos',
            'Actualizaciones legales y normativas importantes',
            'Protección patrimonial y empresarial',
            'Trámites, procesos y requisitos legales',
            'Prevención de demandas, multas y conflictos'
        ],

        'recommended_tone': 'profesional, confiable, claro, serio y orientado a generar autoridad y tranquilidad',

        'audience': 'personas, familias, emprendedores y empresas que necesitan orientación legal, resolver problemas jurídicos o proteger sus intereses y patrimonio',

        'content_formats': [
            'carousel educativo',
            'reel explicativo',
            'preguntas frecuentes',
            'tips legales rápidos',
            'caso práctico',
            'video educativo corto',
            'story informativa con CTA'
        ],

        'keywords': [
            'abogado',
            'legal',
            'jurídico',
            'derechos',
            'contratos',
            'asesoría legal',
            'firma de abogados',
            'demanda',
            'protección legal',
            'notaría',
            'compliance',
            'protección de datos',
            'trámites',
            'derecho laboral',
            'derecho civil',
            'derecho empresarial',
            'multas',
            'seguridad jurídica'
        ]
    }
},
{
    'name': 'Logística & Transporte',
    'slug': 'logistica',

    'subcategories': [
        {'name': 'Mensajería & Domicilios', 'slug': 'mensajeria'},
        {'name': 'Courier Internacional', 'slug': 'courier-internacional'},
        {'name': 'Transporte de Carga', 'slug': 'transporte-carga'},
        {'name': 'Carga Refrigerada', 'slug': 'carga-refrigerada'},
        {'name': 'Flota & Camiones', 'slug': 'flota-camiones'},
        {'name': 'Mudanza Residencial', 'slug': 'mudanza-residencial'},
        {'name': 'Mudanza Corporativa', 'slug': 'mudanza-corporativa'},
        {'name': 'Última Milla', 'slug': 'ultima-milla'},
        {'name': 'Logística Ecommerce', 'slug': 'logistica-ecommerce'},
        {'name': 'Operador Logístico', 'slug': 'operador-logistico'},
        {'name': 'Transporte Empresarial', 'slug': 'transporte-empresarial'},
        {'name': 'Transporte Especial', 'slug': 'transporte-especial'},
        {'name': 'Logística Industrial', 'slug': 'logistica-industrial'},
        {'name': 'Almacenamiento & Bodega', 'slug': 'almacenamiento-bodega'},
        {'name': 'Distribución & Supply Chain', 'slug': 'supply-chain'}
    ],

    'aiContext': {
        'description': 'Empresas de logística, transporte, distribución y mensajería que ayudan a negocios y personas a mover productos, mercancías y operaciones de manera rápida, segura y eficiente mediante flotas, tecnología y coordinación logística.',

        'content_topics': [
            'Procesos logísticos y distribución eficiente',
            'Entrega rápida y cumplimiento operativo',
            'Flotas, camiones y operación en movimiento',
            'Tecnología aplicada a logística y transporte',
            'Casos reales de entregas y cobertura',
            'Logística ecommerce y última milla',
            'Cadena de suministro y optimización de rutas',
            'Seguridad, trazabilidad y control de mercancía',
            'Behind the scenes de operaciones logísticas',
            'Importancia de una logística eficiente para empresas'
        ],

        'recommended_tone': 'profesional, confiable, operativo y enfocado en eficiencia y cumplimiento',

        'audience': 'empresas, ecommerce, industrias y personas que necesitan mover mercancías, coordinar operaciones o garantizar entregas rápidas y seguras',

        'content_formats': [
            'reel operativo',
            'video de flota',
            'carousel educativo',
            'caso de éxito',
            'video de operación logística',
            'tips rápidos empresariales',
            'story operativa'
        ],

        'keywords': [
            'logística',
            'transporte',
            'distribución',
            'mensajería',
            'courier',
            'última milla',
            'supply chain',
            'carga',
            'flota',
            'camiones',
            'operación',
            'entregas',
            'almacenamiento',
            'eficiencia logística',
            'cadena de suministro'
        ]
    }
},
{
    'name': 'Mascotas & Veterinaria',
    'slug': 'mascotas',

    'subcategories': [
        {'name': 'Clínica Veterinaria', 'slug': 'clinica-veterinaria'},
        {'name': 'Veterinaria 24 Horas', 'slug': 'veterinaria-24h'},
        {'name': 'Hospital Veterinario', 'slug': 'hospital-veterinario'},
        {'name': 'Peluquería Canina', 'slug': 'peluqueria-canina'},
        {'name': 'Spa & Grooming para Mascotas', 'slug': 'spa-grooming-mascotas'},
        {'name': 'Tienda de Mascotas', 'slug': 'tienda-mascotas'},
        {'name': 'Pet Shop Premium', 'slug': 'petshop-premium'},
        {'name': 'Alimentos & Nutrición Animal', 'slug': 'nutricion-animal'},
        {'name': 'Adiestramiento', 'slug': 'adiestramiento'},
        {'name': 'Entrenamiento Canino', 'slug': 'entrenamiento-canino'},
        {'name': 'Hotel de Mascotas', 'slug': 'hotel-mascotas'},
        {'name': 'Guardería Canina', 'slug': 'guarderia-canina'},
        {'name': 'Paseador de Perros', 'slug': 'paseador-perros'},
        {'name': 'Accesorios para Mascotas', 'slug': 'accesorios-mascotas'},
        {'name': 'Fotografía Pet', 'slug': 'fotografia-pet'},
        {'name': 'Mascotas Exóticas', 'slug': 'mascotas-exoticas'}
    ],

    'aiContext': {
        'description': 'Clínicas veterinarias, pet shops, groomers, hoteles y negocios para mascotas que ayudan a las personas a cuidar, consentir y mejorar la calidad de vida de sus animales mediante salud, bienestar, alimentación y experiencias seguras.',

        'content_topics': [
            'Consejos de cuidado y salud para mascotas',
            'Antes y después de grooming y peluquería',
            'Tips de entrenamiento y comportamiento',
            'Alimentación y nutrición animal',
            'Historias emocionales y rescates',
            'Mascotas felices en hoteles, guarderías o spa',
            'Productos recomendados y accesorios',
            'Prevención de enfermedades y vacunación',
            'Testimonios de dueños satisfechos',
            'Contenido divertido, tierno y viral con mascotas'
        ],

        'recommended_tone': 'emocional, cercano, confiable y alegre',

        'audience': 'personas, familias y amantes de los animales que buscan cuidar, consentir y mejorar la vida de sus mascotas',

        'content_formats': [
            'reel tierno o divertido',
            'antes y después grooming',
            'tips rápidos veterinarios',
            'video emocional',
            'carousel educativo',
            'story de mascota del día',
            'testimonio de cliente'
        ],

        'keywords': [
            'mascotas',
            'veterinaria',
            'perros',
            'gatos',
            'petshop',
            'grooming',
            'salud animal',
            'entrenamiento canino',
            'hotel de mascotas',
            'spa canino',
            'nutrición animal',
            'amor animal',
            'cuidados',
            'accesorios para mascotas',
            'bienestar animal'
        ]
    }
},
{
    'name': 'ONG & Organizaciones Sociales',
    'slug': 'ong',

    'subcategories': [
        {'name': 'Fundación', 'slug': 'fundacion'},
        {'name': 'Asociación', 'slug': 'asociacion'},
        {'name': 'Corporación sin Ánimo de Lucro', 'slug': 'corporacion-sin-animo-lucro'},
        {'name': 'Iglesia & Comunidad Religiosa', 'slug': 'iglesia-comunidad'},
        {'name': 'Voluntariado', 'slug': 'voluntariado'},
        {'name': 'Impacto Social', 'slug': 'impacto-social'},
        {'name': 'Donaciones & Recaudación', 'slug': 'donaciones-recaudacion'},
        {'name': 'Proyectos Comunitarios', 'slug': 'proyectos-comunitarios'}
    ],

    'aiContext': {
        'description': 'Fundaciones, asociaciones, iglesias y organizaciones sociales que trabajan por causas humanas, comunitarias, educativas, ambientales o solidarias mediante impacto social, voluntariado y movilización de apoyo.',

        'content_topics': [
            'Historias reales de impacto social',
            'Campañas de donación y apoyo comunitario',
            'Testimonios de beneficiarios y voluntarios',
            'Proyectos sociales y resultados alcanzados',
            'Educación sobre causas importantes',
            'Detrás de escena del trabajo comunitario',
            'Eventos solidarios y convocatorias',
            'Voluntariado y participación ciudadana',
            'Transparencia, logros y uso de recursos',
            'Mensajes emocionales para movilizar apoyo'
        ],

        'recommended_tone': 'humano, empático, inspirador y confiable',

        'audience': 'personas, empresas, voluntarios, donantes y comunidades interesadas en apoyar causas sociales, religiosas, ambientales o comunitarias',

        'content_formats': [
            'video testimonial',
            'reel emocional',
            'carousel de impacto',
            'story de campaña',
            'post de convocatoria',
            'video de voluntariado',
            'contenido antes/después social'
        ],

        'keywords': [
            'fundación',
            'ong',
            'impacto social',
            'voluntariado',
            'donaciones',
            'comunidad',
            'solidaridad',
            'ayuda',
            'causa social',
            'transformación',
            'apoyo',
            'proyectos sociales'
        ]
    }
},
{
    'name': 'Publicidad & Comunicaciones',
    'slug': 'publicidad',

    'subcategories': [
        {'name': 'Agencia de Publicidad', 'slug': 'agencia-publicidad'},
        {'name': 'Producción Audiovisual Publicitaria', 'slug': 'produccion-audiovisual-publicitaria'},
        {'name': 'Relaciones Públicas', 'slug': 'relaciones-publicas'},
        {'name': 'Impresión & Señalización', 'slug': 'impresion-senalizacion'},
        {'name': 'Medios & Comunicación', 'slug': 'medios-comunicacion'},
        {'name': 'Branding & Estrategia de Marca', 'slug': 'branding-estrategia-marca'},
        {'name': 'Marketing Digital', 'slug': 'marketing-digital'},
        {'name': 'Community Management', 'slug': 'community-management'},
        {'name': 'Pauta Digital & Ads', 'slug': 'pauta-digital-ads'},
        {'name': 'Copywriting & Contenido', 'slug': 'copywriting-contenido'}
    ],

    'aiContext': {
        'description': 'Agencias de publicidad, comunicación, branding, medios y marketing que ayudan a marcas y empresas a ganar visibilidad, posicionarse mejor, conectar con audiencias y vender mediante estrategia creativa.',

        'content_topics': [
            'Campañas publicitarias y casos de éxito',
            'Estrategias de marca y posicionamiento',
            'Contenido creativo para redes sociales',
            'Producción audiovisual y piezas publicitarias',
            'Resultados de pauta y crecimiento digital',
            'Branding, identidad y comunicación visual',
            'Tendencias de marketing y publicidad',
            'Errores comunes de comunicación de marca',
            'Behind the scenes de campañas',
            'Ideas para vender más con comunicación clara'
        ],

        'recommended_tone': 'creativo, estratégico, moderno y orientado a resultados',

        'audience': 'empresas, emprendedores, marcas y negocios que buscan mejorar su comunicación, ganar visibilidad, posicionarse y vender más',

        'content_formats': [
            'carousel educativo',
            'reel creativo',
            'caso de éxito',
            'video behind the scenes',
            'post de campaña',
            'tips de marketing',
            'story con resultado'
        ],

        'keywords': [
            'publicidad',
            'marketing',
            'branding',
            'comunicación',
            'marca',
            'campañas',
            'contenido',
            'pauta digital',
            'redes sociales',
            'creatividad',
            'estrategia',
            'visibilidad'
        ]
    }
},
{
    'name': 'Salud Mental & Coaching',
    'slug': 'coaching',

    'subcategories': [
        {'name': 'Coach de Vida', 'slug': 'coach-vida'},
        {'name': 'Terapeuta', 'slug': 'terapeuta'},
        {'name': 'Mindfulness & Meditación', 'slug': 'mindfulness'},
        {'name': 'Desarrollo Personal', 'slug': 'desarrollo-personal'},
        {'name': 'Coaching Empresarial', 'slug': 'coaching-empresarial'},
        {'name': 'Coaching Emocional', 'slug': 'coaching-emocional'},
        {'name': 'Terapia de Pareja', 'slug': 'terapia-pareja'},
        {'name': 'Bienestar Laboral', 'slug': 'bienestar-laboral'},
        {'name': 'Mentoría Personal', 'slug': 'mentoria-personal'},
        {'name': 'Hábitos & Productividad Personal', 'slug': 'habitos-productividad-personal'}
    ],

    'aiContext': {
        'description': 'Coaches, terapeutas, mentores y profesionales de bienestar emocional que ayudan a personas y equipos a mejorar claridad mental, autoestima, hábitos, relaciones, productividad y calidad de vida.',

        'content_topics': [
            'Bienestar emocional y autocuidado',
            'Hábitos saludables y crecimiento personal',
            'Manejo del estrés, ansiedad y agotamiento',
            'Mindfulness, meditación y calma mental',
            'Autoestima, propósito y motivación',
            'Relaciones, comunicación y límites sanos',
            'Productividad personal y enfoque',
            'Testimonios y procesos de transformación',
            'Reflexiones prácticas para la vida diaria',
            'Bienestar laboral y liderazgo consciente'
        ],

        'recommended_tone': 'humano, empático, cálido y motivador',

        'audience': 'personas, profesionales, emprendedores y equipos que buscan bienestar emocional, claridad, crecimiento personal y mejores hábitos de vida',

        'content_formats': [
            'reel reflexivo',
            'carousel educativo',
            'frase con contexto',
            'video de tips',
            'story de pregunta',
            'testimonio de transformación',
            'contenido guiado de mindfulness'
        ],

        'keywords': [
            'salud mental',
            'coaching',
            'bienestar',
            'terapia',
            'mindfulness',
            'autoestima',
            'hábitos',
            'estrés',
            'ansiedad',
            'crecimiento personal',
            'motivación',
            'propósito'
        ]
    }
},
{
    'name': 'Seguridad & Vigilancia',
    'slug': 'seguridad',

    'subcategories': [
        {'name': 'Empresa de Vigilancia', 'slug': 'empresa-vigilancia'},
        {'name': 'Alarmas & Cámaras', 'slug': 'alarmas-camaras'},
        {'name': 'Cerrajería', 'slug': 'cerrajeria'},
        {'name': 'Blindaje & Protección', 'slug': 'blindaje-proteccion'},
        {'name': 'Seguridad Electrónica', 'slug': 'seguridad-electronica'},
        {'name': 'Control de Acceso', 'slug': 'control-acceso'},
        {'name': 'Monitoreo 24/7', 'slug': 'monitoreo-24-7'},
        {'name': 'Seguridad Residencial Profesional', 'slug': 'seguridad-residencial-negocio'},
        {'name': 'Seguridad Empresarial', 'slug': 'seguridad-empresarial'},
        {'name': 'CCTV & Videovigilancia', 'slug': 'cctv-videovigilancia'}
    ],

    'aiContext': {
        'description': 'Empresas de seguridad, vigilancia, monitoreo, cámaras, alarmas y protección que ayudan a hogares, negocios y empresas a prevenir riesgos, proteger activos y operar con mayor tranquilidad.',

        'content_topics': [
            'Prevención de robos y riesgos',
            'Beneficios de cámaras, alarmas y monitoreo',
            'Seguridad para hogares, conjuntos y empresas',
            'Control de acceso y protección de activos',
            'Casos reales de prevención y respuesta',
            'Tips de seguridad prácticos',
            'Tecnología aplicada a vigilancia',
            'Errores comunes en seguridad residencial o empresarial',
            'Importancia del monitoreo 24/7',
            'Confianza, protección y tranquilidad'
        ],

        'recommended_tone': 'confiable, serio, preventivo y profesional',

        'audience': 'familias, administradores, empresas, comercios y propietarios que buscan proteger personas, bienes, instalaciones y operaciones',

        'content_formats': [
            'carousel educativo',
            'reel preventivo',
            'video demostrativo',
            'caso de seguridad',
            'tips rápidos',
            'story de alerta',
            'video de instalación'
        ],

        'keywords': [
            'seguridad',
            'vigilancia',
            'cámaras',
            'alarmas',
            'monitoreo',
            'protección',
            'control de acceso',
            'cctv',
            'prevención',
            'seguridad empresarial',
            'seguridad residencial',
            'tranquilidad'
        ]
    }
},
{'name': 'Servicios del Hogar',
  'slug': 'servicios-hogar',
  'subcategories': [{'name': 'Limpieza Profesional', 'slug': 'limpieza-profesional'},
                    {'name': 'Lavado de Muebles & Colchones', 'slug': 'lavado-muebles-colchones'},
                    {'name': 'Lavandería Premium', 'slug': 'lavanderia-premium'},
                    {'name': 'Jardinería & Paisajismo', 'slug': 'jardineria-paisajismo'},
                    {'name': 'Control de Plagas', 'slug': 'control-plagas'},
                    {'name': 'Plomería Residencial', 'slug': 'plomeria-residencial'},
                    {'name': 'Electricista Residencial', 'slug': 'electricista-residencial'},
                    {'name': 'Reparaciones & Handyman', 'slug': 'handyman'},
                    {'name': 'Mantenimiento Residencial', 'slug': 'mantenimiento-residencial'},
                    {'name': 'Seguridad Residencial', 'slug': 'seguridad-residencial'}],
  'aiContext': {'description': 'Empresas y profesionales que ayudan a mantener, reparar, limpiar '
                               'y mejorar hogares mediante servicios rápidos, confiables y '
                               'orientados a comodidad y tranquilidad.',
                'content_topics': ['Antes y después de limpiezas o reparaciones',
                                   'Tips de mantenimiento para el hogar',
                                   'Problemas comunes y cómo solucionarlos',
                                   'Transformaciones de espacios',
                                   'Consejos de organización y limpieza',
                                   'Testimonios de clientes satisfechos',
                                   'Proceso de trabajo y resultados reales',
                                   'Servicios de emergencia o atención rápida',
                                   'Seguridad y confianza en el servicio',
                                   'Contenido práctico para hogares y familias'],
                'recommended_tone': 'confiable, cercano, práctico y profesional',
                'audience': 'familias, propietarios, arrendatarios y personas que buscan soluciones '
                            'rápidas y confiables para el cuidado de su hogar',
                'content_formats': ['antes y después',
                                    'reel de transformación',
                                    'tips rápidos',
                                    'video de proceso',
                                    'testimonio de cliente',
                                    'carousel educativo'],
                'keywords': ['hogar',
                             'limpieza',
                             'mantenimiento',
                             'reparaciones',
                             'plomería',
                             'electricista',
                             'mudanzas',
                             'control de plagas',
                             'lavandería',
                             'servicios residenciales',
                             'familia',
                             'confianza']}},
{
    'name': 'Turismo & Viajes',
    'slug': 'turismo',

    'subcategories': [
        {'name': 'Agencia de Viajes', 'slug': 'agencia-viajes'},
        {'name': 'Hotel & Hostal', 'slug': 'hotel-hostal'},
        {'name': 'Hotel Boutique', 'slug': 'hotel-boutique'},
        {'name': 'Resort & Hospedaje Premium', 'slug': 'resort-hospedaje-premium'},
        {'name': 'Glamping & Ecoturismo', 'slug': 'glamping-ecoturismo'},
        {'name': 'Finca Turística', 'slug': 'finca-turistica'},
        {'name': 'Tours & Excursiones', 'slug': 'tours-excursiones'},
        {'name': 'Experiencias Locales', 'slug': 'experiencias-locales'},
        {'name': 'Turismo de Aventura', 'slug': 'turismo-aventura'},
        {'name': 'Turismo Romántico & Parejas', 'slug': 'turismo-romantico'},
        {'name': 'Turismo Familiar', 'slug': 'turismo-familiar'},
        {'name': 'Transporte Turístico', 'slug': 'transporte-turistico'},
        {'name': 'Guía Turístico', 'slug': 'guia-turistico'},
        {'name': 'Paquetes Vacacionales', 'slug': 'paquetes-vacacionales'},
        {'name': 'Viajes Corporativos', 'slug': 'viajes-corporativos'}
    ],

    'aiContext': {
        'description': 'Agencias de viajes, hoteles, glampings, operadores turísticos y experiencias locales que ayudan a personas, parejas, familias y empresas a descubrir destinos, vivir momentos memorables y planear viajes sin complicaciones.',

        'content_topics': [
            'Destinos recomendados y experiencias imperdibles',
            'Hospedajes, habitaciones, vistas y comodidades',
            'Planes románticos, familiares y de aventura',
            'Itinerarios, paquetes y consejos para viajar mejor',
            'Testimonios y experiencias reales de viajeros',
            'Contenido emocional sobre descanso, aventura y desconexión',
            'Promociones, temporadas y fechas especiales',
            'Tours, excursiones y actividades locales',
            'Behind the scenes de hoteles, glampings o rutas',
            'Razones para reservar ahora y vivir una experiencia única'
        ],

        'recommended_tone': 'aspiracional, emocional, visual y cercano',

        'audience': 'parejas, familias, viajeros, turistas, empresas y personas que buscan descansar, celebrar, explorar nuevos destinos o vivir experiencias memorables',

        'content_formats': [
            'reel de destino',
            'video cinematográfico',
            'carousel de itinerario',
            'tour de habitación o hospedaje',
            'story con promoción',
            'testimonio de viajero',
            'guía rápida de viaje'
        ],

        'keywords': [
            'turismo',
            'viajes',
            'hotel',
            'glamping',
            'ecoturismo',
            'vacaciones',
            'aventura',
            'parejas',
            'familia',
            'destino',
            'hospedaje',
            'tours',
            'experiencias',
            'reserva',
            'escapada',
            'viajeros'
        ]
    }
},

                             ]



def get_industry_map():
    """Mapa nombre-de-industria -> entrada del catálogo."""
    return {entry["name"]: entry for entry in INDUSTRY_CATALOG}


def get_sub_industry_slug_map():
    """Mapa slug-de-sub-industria -> nombre legible."""
    return {
        subcategory["slug"]: subcategory["name"]
        for entry in INDUSTRY_CATALOG
        for subcategory in entry.get("subcategories", [])
    }


def sub_industry_to_slug(sub_industry_name):
    """Devuelve el slug de una sub-industria por nombre, o None si no existe."""
    if not sub_industry_name:
        return None

    for entry in INDUSTRY_CATALOG:
        for subcategory in entry.get("subcategories", []):
            if subcategory.get("name") == sub_industry_name:
                return subcategory.get("slug")

    return None


def get_subcategories(industry_name):
    """Devuelve las sub-industrias de una industria, o [] si no existe."""
    industry = get_industry_map().get(industry_name)
    if not industry:
        return []
    return industry.get("subcategories", [])


def get_industry_by_slug(industry_slug):
    """Busca una industria por slug."""
    if not industry_slug:
        return None

    for entry in INDUSTRY_CATALOG:
        if entry.get("slug") == industry_slug:
            return entry

    return None


def get_industries_response():
    """Formato estándar para el endpoint GET /api/industries."""

    industries = []

    for industry in INDUSTRY_CATALOG:
        industry_copy = {
            **industry,
            "aiContext": industry.get(
                "aiContext",
                DEFAULT_AI_CONTEXT
            )
        }

        industries.append(industry_copy)

    return {
        "industries": industries,
        "total": len(industries),
    }

INDUSTRY_MAP = get_industry_map()
SUB_INDUSTRY_SLUG_MAP = get_sub_industry_slug_map()
