import React, { useState } from "react";
import { SeoMeta } from "@/hooks/useSeoMeta";

type Lang = "es" | "en" | "pt";

const S = {
  page: "min-h-screen bg-background text-foreground py-12 px-4",
  wrap: "max-w-3xl mx-auto",
  header: "flex items-center gap-3 mb-2",
  logo: "w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center",
  logoText: "text-primary font-black text-sm",
  title: "text-2xl font-bold",
  subtitle: "text-sm text-muted-foreground",
  updated: "text-xs text-muted-foreground mt-1 mb-6",
  langBar: "flex gap-2 mb-8",
  langBtn: (active: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-semibold border transition-all ${
      active
        ? "bg-primary text-background border-primary"
        : "border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
    }`,
  toc: "bg-white/5 rounded-xl p-5 mb-10 border border-border/30",
  tocTitle: "text-sm font-semibold mb-3",
  tocList: "space-y-1",
  tocItem: "text-xs text-primary hover:underline cursor-pointer block",
  section: "space-y-3 mb-10",
  h2: "text-base font-bold text-foreground border-l-2 border-primary pl-3",
  p: "text-sm text-muted-foreground leading-relaxed",
  ul: "list-disc list-inside space-y-1 text-sm text-muted-foreground leading-relaxed pl-2",
  box: "bg-white/5 border border-border/40 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed",
  warn: "bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-sm text-amber-300 leading-relaxed",
  footer: "pt-8 border-t border-border/30 text-center",
  footerText: "text-xs text-muted-foreground",
  links: "flex justify-center gap-4 mt-2",
  link: "text-xs text-primary hover:underline",
};

const code = (s: string) => (
  <code className="bg-white/10 px-1 rounded text-xs mx-1">{s}</code>
);

const content: Record<Lang, { meta: { subtitle: string; updated: string; toc: string }; sections: { id: string; title: string; body: React.ReactNode }[] }> = {
  es: {
    meta: {
      subtitle: "Términos y Condiciones de Uso",
      updated: "Versión 1.0 — Última actualización: 9 de abril de 2026",
      toc: "Contenido",
    },
    sections: [
      {
        id: "s1", title: "1. Partes y definiciones",
        body: <>
          <p className={S.p}>Para efectos de estos Términos y Condiciones se entiende por:</p>
          <ul className={S.ul}>
            <li><strong>«hazpost»</strong> o <strong>«la Plataforma»</strong>: el servicio de software disponible en <a href="https://hazpost.app" className="text-primary hover:underline" target="_blank" rel="noreferrer">hazpost.app</a>, operado por su(s) propietario(s).</li>
            <li><strong>«Usuario»</strong> o <strong>«Cliente»</strong>: toda persona natural o jurídica que cree una cuenta en hazpost y haga uso de sus funcionalidades.</li>
            <li><strong>«Contenido»</strong>: textos, imágenes, videos, hashtags, captions u otro material generado, cargado, programado o publicado a través de la Plataforma.</li>
            <li><strong>«Créditos»</strong>: unidad interna no monetaria asignada a cada plan de suscripción que se consume al usar las funciones de generación de contenido con IA.</li>
            <li><strong>«Plataformas de terceros»</strong>: redes sociales externas como TikTok, Instagram, Facebook u otras conectadas mediante OAuth.</li>
            <li><strong>«Plan»</strong>: nivel de suscripción contratado (Free, Starter, Business o Agency).</li>
          </ul>
        </>,
      },
      {
        id: "s2", title: "2. Aceptación de los términos",
        body: <>
          <div className={S.warn}>Al crear una cuenta o usar hazpost, el Usuario declara haber leído, entendido y aceptado en su totalidad estos Términos. Si no está de acuerdo, debe abstenerse de usar la Plataforma.</div>
          <p className={S.p}>La aceptación puede producirse al hacer clic en "Crear cuenta", al iniciar sesión mediante Google OAuth o al comenzar a usar cualquier funcionalidad de la Plataforma. Este acuerdo tiene plena validez legal entre las partes.</p>
          <p className={S.p}>Para crear una cuenta el Usuario debe ser mayor de 18 años o actuar con autorización legal de un adulto responsable. Las cuentas corporativas son responsabilidad del representante legal de la entidad.</p>
        </>,
      },
      {
        id: "s3", title: "3. Descripción del servicio",
        body: <>
          <p className={S.p}>hazpost es una plataforma SaaS de gestión de contenido para redes sociales con inteligencia artificial. Las funcionalidades incluyen, sin limitarse a:</p>
          <ul className={S.ul}>
            <li>Generación automatizada de captions, hashtags e imágenes con IA.</li>
            <li>Programación y publicación automática en TikTok, Instagram y Facebook.</li>
            <li>Gestión de múltiples nichos y perfiles de marca.</li>
            <li>Panel de analíticas de rendimiento de contenido.</li>
            <li>Flujos de aprobación y revisión de contenido.</li>
            <li>Gestión de cuentas sociales conectadas mediante OAuth.</li>
          </ul>
          <p className={S.p}>hazpost actúa exclusivamente como herramienta tecnológica. <strong>No es una agencia de marketing, no garantiza resultados de ventas, alcance, seguidores ni engagement</strong> en ninguna plataforma social.</p>
        </>,
      },
      {
        id: "s4", title: "4. Planes, pagos y créditos",
        body: <>
          <p className={S.p}><strong>4.1 Planes disponibles:</strong> hazpost ofrece un plan gratuito (Free) con funcionalidades limitadas y planes de pago (Starter, Business, Agency) con mayor capacidad. Los precios vigentes se muestran en la plataforma y pueden actualizarse con 30 días de aviso previo.</p>
          <p className={S.p}><strong>4.2 Ciclo de facturación:</strong> Los planes de pago tienen ciclo mensual. El cobro se realiza al inicio de cada período a través del procesador de pagos integrado (Wompi u otro designado por hazpost). El acceso se mantiene durante todo el período pagado.</p>
          <p className={S.p}><strong>4.3 Créditos:</strong> Los créditos no utilizados al cierre del período mensual <strong>no se acumulan ni se transfieren al siguiente mes</strong>, salvo en paquetes adicionales expresamente marcados como acumulables.</p>
          <p className={S.p}><strong>4.4 Impuestos:</strong> Los precios no incluyen IVA u otros impuestos aplicables. El Usuario es responsable de todos los impuestos que correspondan en su jurisdicción.</p>
          <p className={S.p}><strong>4.5 Fallo en el pago:</strong> Si un cargo no puede procesarse, el plan pasará automáticamente al nivel Free y el acceso premium se suspenderá hasta regularizar el pago. hazpost no se responsabiliza por pérdida de contenido programado durante una suspensión por falta de pago.</p>
        </>,
      },
      {
        id: "s5", title: "5. Política de reembolsos",
        body: <>
          <div className={S.warn}><strong>Las suscripciones NO son reembolsables</strong> una vez procesado el cobro del período. Los créditos consumidos no son recuperables.</div>
          <p className={S.p}>Se podrá considerar un crédito a cuenta (no un reembolso en dinero) únicamente en caso de una interrupción del servicio atribuible exclusivamente a hazpost con duración superior a 72 horas continuas dentro del período pagado, verificada y confirmada por el equipo de hazpost.</p>
          <p className={S.p}>Los reembolsos por mal funcionamiento de APIs de terceros (TikTok, Meta, Google, etc.) no proceden ya que hazpost no controla la disponibilidad de esas plataformas.</p>
        </>,
      },
      {
        id: "s6", title: "6. Acceso y cuentas de usuario",
        body: <>
          <p className={S.p}><strong>6.1</strong> El Usuario es responsable de mantener la confidencialidad de sus credenciales. Cualquier actividad realizada desde su cuenta es de su entera responsabilidad.</p>
          <p className={S.p}><strong>6.2</strong> El Usuario debe notificar inmediatamente a hazpost cualquier acceso no autorizado a su cuenta en <a href="mailto:info@hazpost.app" className="text-primary hover:underline">info@hazpost.app</a>.</p>
          <p className={S.p}><strong>6.3</strong> No está permitido compartir credenciales entre múltiples personas ajenas a la cuenta contratada, ni vender o ceder el acceso a terceros.</p>
          <p className={S.p}><strong>6.4</strong> hazpost puede requerir verificación adicional de identidad en casos de actividad inusual.</p>
        </>,
      },
      {
        id: "s7", title: "7. Usos prohibidos",
        body: <>
          <p className={S.p}>Queda estrictamente prohibido usar hazpost para:</p>
          <ul className={S.ul}>
            <li>Publicar contenido ilegal, obsceno, difamatorio, amenazante o que incite al odio.</li>
            <li>Infringir derechos de propiedad intelectual de terceros.</li>
            <li>Realizar spam, phishing, distribución de malware o actividades fraudulentas.</li>
            <li>Manipular métricas de redes sociales de forma artificial (bots, compra de seguidores, etc.).</li>
            <li>Intentar acceder a áreas restringidas de la Plataforma o sistemas de terceros sin autorización.</li>
            <li>Realizar ingeniería inversa, descompilar o extraer el código fuente de la Plataforma.</li>
            <li>Suplantar identidad de personas, marcas u organizaciones.</li>
            <li>Violar los Términos de Servicio de TikTok, Meta, Google u otras plataformas conectadas.</li>
          </ul>
          <p className={S.p}>El incumplimiento podrá resultar en suspensión o cancelación inmediata sin derecho a reembolso y, si aplica, en acciones legales.</p>
        </>,
      },
      {
        id: "s8", title: "8. Contenido generado por IA",
        body: <>
          <p className={S.p}><strong>8.1 Revisión del Usuario:</strong> El Usuario es el único responsable de revisar, aprobar y verificar el contenido antes de su publicación. La publicación sin revisión previa es responsabilidad exclusiva del Usuario.</p>
          <p className={S.p}><strong>8.2 Sin garantía de exactitud:</strong> hazpost no garantiza que el contenido generado sea preciso, completo, libre de errores, sesgos ni adecuado para todos los públicos o mercados.</p>
          <p className={S.p}><strong>8.3 Propiedad:</strong> El contenido generado para un Usuario pertenece a dicho Usuario, sujeto a los términos de los modelos de IA subyacentes. hazpost no reclama derechos sobre el contenido generado para los Usuarios.</p>
        </>,
      },
      {
        id: "s9", title: "9. Propiedad intelectual",
        body: <>
          <p className={S.p}><strong>9.1 De hazpost:</strong> La plataforma, su código, diseño, marca, logotipos, interfaces, algoritmos y metodologías son propiedad exclusiva de hazpost. El uso no transfiere ningún derecho sobre estos activos al Usuario.</p>
          <p className={S.p}><strong>9.2 Del Usuario:</strong> El Usuario retiene todos los derechos sobre el contenido original que cargue o publique. Al usar la Plataforma, otorga a hazpost una licencia limitada y no exclusiva para procesar dicho contenido con el único fin de prestar el servicio.</p>
        </>,
      },
      {
        id: "s10", title: "10. Conexión con plataformas de terceros",
        body: <>
          <p className={S.p}><strong>10.1 Autorización OAuth:</strong> Al conectar cuentas de TikTok, Instagram, Facebook u otras plataformas, el Usuario autoriza a hazpost a actuar en su nombre para las acciones específicas indicadas durante el proceso de conexión.</p>
          <p className={S.p}><strong>10.2 Almacenamiento de tokens:</strong> Los tokens de acceso se almacenan cifrados con AES-256-GCM. Solo se utilizan para ejecutar las acciones autorizadas. No se comparten con terceros.</p>
          <p className={S.p}><strong>10.3 Responsabilidad sobre APIs externas:</strong> hazpost <strong>no se responsabiliza</strong> por interrupciones, cambios o suspensiones de APIs de terceros (TikTok, Meta, Google, etc.).</p>
          <div className={S.box}><strong>Scopes de TikTok:</strong> {code("user.info.basic")} {code("video.publish")} {code("video.upload")} — usados exclusivamente para publicar videos en las cuentas autorizadas por el Usuario.</div>
        </>,
      },
      {
        id: "s11", title: "11. Privacidad y protección de datos",
        body: <>
          <p className={S.p}>El tratamiento de datos personales se rige por nuestra <a href="/privacy-policy" className="text-primary hover:underline">Política de Privacidad</a>. hazpost cumple con la Ley 1581 de 2012 de Colombia (Protección de Datos Personales). Los datos no se venden ni ceden a terceros con fines comerciales.</p>
        </>,
      },
      {
        id: "s12", title: "12. Disponibilidad del servicio (SLA)",
        body: <>
          <p className={S.p}>hazpost se esfuerza por mantener una disponibilidad del <strong>95% mensual</strong>, excluyendo mantenimientos programados. <strong>No se garantiza disponibilidad ininterrumpida ni libre de errores.</strong></p>
          <p className={S.p}>hazpost no se responsabiliza por pérdidas derivadas de publicaciones que no se ejecuten a tiempo por interrupciones del servicio, fallos de conectividad del Usuario o fallas en APIs de plataformas externas.</p>
        </>,
      },
      {
        id: "s13", title: "13. Limitación de responsabilidad",
        body: <>
          <div className={S.warn}><strong>IMPORTANTE:</strong> Esta sección limita la responsabilidad máxima de hazpost frente al Usuario.</div>
          <p className={S.p}><strong>13.1</strong> La Plataforma se proporciona <strong>"tal cual" (as-is)</strong> y <strong>"según disponibilidad"</strong>, sin garantías expresas ni implícitas de ningún tipo.</p>
          <p className={S.p}><strong>13.2</strong> hazpost <strong>no será responsable</strong> por daños indirectos, incidentales, especiales, consecuentes o punitivos, incluyendo pérdida de ganancias, clientes, daño reputacional o pérdida de datos.</p>
          <p className={S.p}><strong>13.3</strong> La responsabilidad total de hazpost no excederá en ningún caso el valor pagado por el Usuario en los últimos <strong>3 meses</strong>.</p>
        </>,
      },
      {
        id: "s14", title: "14. Indemnización",
        body: <>
          <p className={S.p}>El Usuario acepta indemnizar y mantener indemne a hazpost de cualquier reclamación, daño o gasto (incluidos honorarios de abogados) que surjan de: (a) el uso del servicio; (b) el contenido publicado; (c) la violación de estos Términos; (d) la violación de derechos de terceros.</p>
        </>,
      },
      {
        id: "s15", title: "15. Suspensión y terminación",
        body: <>
          <p className={S.p}><strong>15.1 Por el Usuario:</strong> El Usuario puede cancelar su cuenta en cualquier momento. No se realizan reembolsos proporcionales por días no utilizados.</p>
          <p className={S.p}><strong>15.2 Por hazpost:</strong> hazpost puede suspender o cancelar una cuenta de forma inmediata en caso de: violación de estos Términos, actividad fraudulenta, impago reiterado o riesgo para la seguridad de la Plataforma.</p>
          <p className={S.p}><strong>15.3 Efectos:</strong> Los datos se conservarán 30 días para exportación, tras los cuales podrán eliminarse permanentemente.</p>
        </>,
      },
      {
        id: "s16", title: "16. Modificaciones al servicio",
        body: <>
          <p className={S.p}>hazpost puede modificar, suspender o discontinuar funcionalidades en cualquier momento. Los cambios materiales a estos Términos se notificarán con <strong>15 días de anticipación</strong> por email o aviso en la Plataforma. El uso continuado implica aceptación de los nuevos Términos.</p>
        </>,
      },
      {
        id: "s17", title: "17. Fuerza mayor",
        body: <>
          <p className={S.p}>hazpost no será responsable por incumplimientos causados por circunstancias fuera de su control: desastres naturales, cortes de energía o internet, fallos de proveedores de nube, cambios regulatorios, pandemias, huelgas o ataques cibernéticos de terceros.</p>
        </>,
      },
      {
        id: "s18", title: "18. Ley aplicable y jurisdicción",
        body: <>
          <p className={S.p}>Estos Términos se rigen por las leyes de la <strong>República de Colombia</strong>. Las disputas se someterán a negociación directa de buena fe por 30 días y, de no resolverse, a los jueces y tribunales competentes de la ciudad de <strong>Cali, Colombia</strong>.</p>
        </>,
      },
      {
        id: "s19", title: "19. Contacto",
        body: <>
          <div className={S.box}>
            <p className="font-semibold mb-2">hazpost</p>
            <p>Email: <a href="mailto:info@hazpost.app" className="text-primary hover:underline">info@hazpost.app</a></p>
            <p>Web: <a href="https://hazpost.app" className="text-primary hover:underline" target="_blank" rel="noreferrer">hazpost.app</a></p>
          </div>
        </>,
      },
    ],
  },

  en: {
    meta: {
      subtitle: "Terms and Conditions of Use",
      updated: "Version 1.0 — Last updated: April 9, 2026",
      toc: "Table of Contents",
    },
    sections: [
      {
        id: "s1", title: "1. Parties and definitions",
        body: <>
          <p className={S.p}>For purposes of these Terms and Conditions:</p>
          <ul className={S.ul}>
            <li><strong>"hazpost"</strong> or <strong>"the Platform"</strong>: the software service available at <a href="https://hazpost.app" className="text-primary hover:underline" target="_blank" rel="noreferrer">hazpost.app</a>, operated by its owner(s).</li>
            <li><strong>"User"</strong> or <strong>"Customer"</strong>: any individual or legal entity that creates an account on hazpost and uses its features.</li>
            <li><strong>"Content"</strong>: text, images, videos, hashtags, captions, or other material generated, uploaded, scheduled, or published through the Platform.</li>
            <li><strong>"Credits"</strong>: internal non-monetary units assigned to each subscription plan, consumed when using AI content generation features.</li>
            <li><strong>"Third-party Platforms"</strong>: external social networks such as TikTok, Instagram, Facebook, or others connected via OAuth.</li>
            <li><strong>"Plan"</strong>: the contracted subscription tier (Free, Starter, Business, or Agency).</li>
          </ul>
        </>,
      },
      {
        id: "s2", title: "2. Acceptance of terms",
        body: <>
          <div className={S.warn}>By creating an account or using hazpost, the User declares to have read, understood, and fully accepted these Terms. If you disagree, you must refrain from using the Platform.</div>
          <p className={S.p}>Acceptance may occur by clicking "Create account", logging in via Google OAuth, or beginning to use any feature of the Platform. This agreement has full legal validity between the parties.</p>
          <p className={S.p}>To create an account, the User must be at least 18 years old or act under the legal authorization of a responsible adult. Corporate accounts are the responsibility of the entity's legal representative.</p>
        </>,
      },
      {
        id: "s3", title: "3. Description of the service",
        body: <>
          <p className={S.p}>hazpost is a SaaS platform for AI-powered social media content management. Features include, but are not limited to:</p>
          <ul className={S.ul}>
            <li>Automated generation of captions, hashtags, and images using AI.</li>
            <li>Scheduling and automatic publishing to TikTok, Instagram, and Facebook.</li>
            <li>Management of multiple niches and brand profiles.</li>
            <li>Content performance analytics dashboard.</li>
            <li>Content approval and review workflows.</li>
            <li>Management of social accounts connected via OAuth.</li>
          </ul>
          <p className={S.p}>hazpost acts solely as a technology tool. <strong>It is not a marketing agency and does not guarantee sales results, reach, followers, or engagement</strong> on any social platform.</p>
        </>,
      },
      {
        id: "s4", title: "4. Plans, payments and credits",
        body: <>
          <p className={S.p}><strong>4.1 Available plans:</strong> hazpost offers a free plan (Free) with limited features and paid plans (Starter, Business, Agency) with greater capacity. Current prices are displayed on the platform and may be updated with 30 days' prior notice.</p>
          <p className={S.p}><strong>4.2 Billing cycle:</strong> Paid plans are billed monthly, at the beginning of each period, through the integrated payment processor (Wompi or another designated by hazpost).</p>
          <p className={S.p}><strong>4.3 Credits:</strong> Unused credits at the end of the monthly period <strong>do not accumulate or carry over</strong> to the next month, except for add-on packages expressly marked as accumulating.</p>
          <p className={S.p}><strong>4.4 Taxes:</strong> Listed prices do not include applicable taxes (VAT or others). The User is responsible for all taxes applicable in their jurisdiction.</p>
          <p className={S.p}><strong>4.5 Payment failure:</strong> If a charge cannot be processed, the plan will automatically downgrade to Free and premium access will be suspended until payment is resolved. hazpost is not responsible for loss of scheduled content during a suspension due to non-payment.</p>
        </>,
      },
      {
        id: "s5", title: "5. Refund policy",
        body: <>
          <div className={S.warn}><strong>Subscriptions are NON-REFUNDABLE</strong> once the period charge has been processed. Consumed credits are non-recoverable.</div>
          <p className={S.p}>A service credit (not a cash refund) may be considered only in the event of a service outage attributable solely to hazpost lasting more than 72 continuous hours within the paid period, verified and confirmed by the hazpost team.</p>
          <p className={S.p}>Refunds for third-party API malfunctions (TikTok, Meta, Google, etc.) are not available, as hazpost does not control the availability of those external platforms.</p>
        </>,
      },
      {
        id: "s6", title: "6. Access and user accounts",
        body: <>
          <p className={S.p}><strong>6.1</strong> The User is responsible for maintaining the confidentiality of their credentials. Any activity from their account is entirely their responsibility.</p>
          <p className={S.p}><strong>6.2</strong> The User must immediately notify hazpost of any unauthorized access to their account at <a href="mailto:info@hazpost.app" className="text-primary hover:underline">info@hazpost.app</a>.</p>
          <p className={S.p}><strong>6.3</strong> Sharing credentials among multiple people outside the contracted account, or selling or transferring access to unauthorized third parties, is not permitted.</p>
          <p className={S.p}><strong>6.4</strong> hazpost may require additional identity verification in cases of unusual activity.</p>
        </>,
      },
      {
        id: "s7", title: "7. Prohibited uses",
        body: <>
          <p className={S.p}>It is strictly prohibited to use hazpost to:</p>
          <ul className={S.ul}>
            <li>Publish illegal, obscene, defamatory, threatening, or hate-inciting content.</li>
            <li>Infringe third-party intellectual property rights.</li>
            <li>Engage in spam, phishing, malware distribution, or fraudulent activities.</li>
            <li>Artificially manipulate social media metrics (bots, follower purchases, etc.).</li>
            <li>Attempt unauthorized access to restricted areas of the Platform or third-party systems.</li>
            <li>Reverse-engineer, decompile, or extract the Platform's source code.</li>
            <li>Impersonate individuals, brands, or organizations.</li>
            <li>Violate the Terms of Service of TikTok, Meta, Google, or other connected platforms.</li>
          </ul>
          <p className={S.p}>Violations may result in immediate account suspension or cancellation without refund and, where applicable, legal action.</p>
        </>,
      },
      {
        id: "s8", title: "8. AI-generated content",
        body: <>
          <p className={S.p}><strong>8.1 User review:</strong> The User is solely responsible for reviewing, approving, and verifying content before publication. Publishing AI-generated content without prior review is exclusively the User's responsibility.</p>
          <p className={S.p}><strong>8.2 No accuracy guarantee:</strong> hazpost does not guarantee that AI-generated content is accurate, complete, error-free, unbiased, or suitable for all audiences or markets.</p>
          <p className={S.p}><strong>8.3 Ownership:</strong> Content generated for a User belongs to that User, subject to the terms of the underlying AI models. hazpost claims no ownership rights over content generated for Users.</p>
        </>,
      },
      {
        id: "s9", title: "9. Intellectual property",
        body: <>
          <p className={S.p}><strong>9.1 hazpost's property:</strong> The platform, its code, design, brand, logos, interfaces, algorithms, and methodologies are the exclusive property of hazpost. Using the Platform transfers no rights over these assets to the User.</p>
          <p className={S.p}><strong>9.2 User's property:</strong> The User retains all rights over original content they upload or publish. By using the Platform, they grant hazpost a limited, non-exclusive license to process such content solely for the purpose of providing the contracted service.</p>
        </>,
      },
      {
        id: "s10", title: "10. Connection to third-party platforms",
        body: <>
          <p className={S.p}><strong>10.1 OAuth authorization:</strong> By connecting TikTok, Instagram, Facebook, or other accounts, the User expressly authorizes hazpost to act on their behalf for the specific actions indicated during the connection process.</p>
          <p className={S.p}><strong>10.2 Token storage:</strong> Access tokens are stored encrypted with AES-256-GCM. They are only used to execute User-authorized actions and are not shared with third parties.</p>
          <p className={S.p}><strong>10.3 External API liability:</strong> hazpost <strong>is not responsible</strong> for outages, changes, suspensions, or terminations of third-party APIs (TikTok, Meta, Google, etc.).</p>
          <div className={S.box}><strong>TikTok scopes requested:</strong> {code("user.info.basic")} {code("video.publish")} {code("video.upload")} — used exclusively to publish videos on User-authorized TikTok accounts.</div>
        </>,
      },
      {
        id: "s11", title: "11. Privacy and data protection",
        body: <>
          <p className={S.p}>The processing of personal data is governed by our <a href="/privacy-policy" className="text-primary hover:underline">Privacy Policy</a>. hazpost complies with Colombia's Law 1581 of 2012 (Personal Data Protection). User data is not sold or transferred to third parties for commercial purposes.</p>
        </>,
      },
      {
        id: "s12", title: "12. Service availability (SLA)",
        body: <>
          <p className={S.p}>hazpost strives to maintain <strong>95% monthly uptime</strong>, excluding scheduled maintenance. <strong>Uninterrupted or error-free service is not guaranteed.</strong></p>
          <p className={S.p}>hazpost is not liable for losses resulting from posts that fail to publish on time due to service outages, User connectivity issues, or failures in external platform APIs.</p>
        </>,
      },
      {
        id: "s13", title: "13. Limitation of liability",
        body: <>
          <div className={S.warn}><strong>IMPORTANT — Read carefully:</strong> This section limits hazpost's maximum liability to the User.</div>
          <p className={S.p}><strong>13.1</strong> The Platform is provided <strong>"as-is"</strong> and <strong>"as available"</strong>, without express or implied warranties of any kind.</p>
          <p className={S.p}><strong>13.2</strong> hazpost <strong>will not be liable</strong> for indirect, incidental, special, consequential, or punitive damages, including loss of profits, customers, reputational damage, or data loss.</p>
          <p className={S.p}><strong>13.3</strong> hazpost's total liability shall in no case exceed the amount paid by the User in the prior <strong>3 months</strong>.</p>
        </>,
      },
      {
        id: "s14", title: "14. Indemnification",
        body: <>
          <p className={S.p}>The User agrees to indemnify and hold harmless hazpost, its directors, employees, agents, and partners from any claims, damages, losses, costs, or expenses (including attorney's fees) arising from: (a) use of the service; (b) published content; (c) violation of these Terms; (d) infringement of third-party rights.</p>
        </>,
      },
      {
        id: "s15", title: "15. Suspension and termination",
        body: <>
          <p className={S.p}><strong>15.1 By the User:</strong> The User may cancel their account at any time. No pro-rated refunds are issued for unused days.</p>
          <p className={S.p}><strong>15.2 By hazpost:</strong> hazpost may immediately suspend or cancel an account for: Terms violations, fraudulent activity, repeated non-payment, or risk to the Platform's security.</p>
          <p className={S.p}><strong>15.3 Effects:</strong> Data will be retained for 30 days for export, after which it may be permanently deleted.</p>
        </>,
      },
      {
        id: "s16", title: "16. Modifications to the service",
        body: <>
          <p className={S.p}>hazpost may modify, suspend, or discontinue any service feature at any time. Material changes to these Terms will be communicated with <strong>15 days' notice</strong> by email or prominent notice on the Platform. Continued use implies acceptance of the new Terms.</p>
        </>,
      },
      {
        id: "s17", title: "17. Force majeure",
        body: <>
          <p className={S.p}>hazpost will not be liable for delays or failures caused by circumstances beyond its reasonable control, including natural disasters, power or internet outages, cloud provider failures, regulatory changes, government acts, pandemics, strikes, or third-party cyberattacks.</p>
        </>,
      },
      {
        id: "s18", title: "18. Governing law and jurisdiction",
        body: <>
          <p className={S.p}>These Terms are governed by the laws of the <strong>Republic of Colombia</strong>. Disputes will first be subject to good-faith direct negotiation for 30 days, and if unresolved, to the competent courts of <strong>Cali, Colombia</strong>.</p>
        </>,
      },
      {
        id: "s19", title: "19. Contact",
        body: <>
          <div className={S.box}>
            <p className="font-semibold mb-2">hazpost</p>
            <p>Email: <a href="mailto:info@hazpost.app" className="text-primary hover:underline">info@hazpost.app</a></p>
            <p>Web: <a href="https://hazpost.app" className="text-primary hover:underline" target="_blank" rel="noreferrer">hazpost.app</a></p>
          </div>
        </>,
      },
    ],
  },

  pt: {
    meta: {
      subtitle: "Termos e Condições de Uso",
      updated: "Versão 1.0 — Última atualização: 9 de abril de 2026",
      toc: "Sumário",
    },
    sections: [
      {
        id: "s1", title: "1. Partes e definições",
        body: <>
          <p className={S.p}>Para efeitos destes Termos e Condições, entende-se por:</p>
          <ul className={S.ul}>
            <li><strong>«hazpost»</strong> ou <strong>«a Plataforma»</strong>: o serviço de software disponível em <a href="https://hazpost.app" className="text-primary hover:underline" target="_blank" rel="noreferrer">hazpost.app</a>, operado pelo(s) seu(s) proprietário(s).</li>
            <li><strong>«Usuário»</strong> ou <strong>«Cliente»</strong>: qualquer pessoa física ou jurídica que crie uma conta no hazpost e use suas funcionalidades.</li>
            <li><strong>«Conteúdo»</strong>: textos, imagens, vídeos, hashtags, legendas ou outro material gerado, carregado, agendado ou publicado através da Plataforma.</li>
            <li><strong>«Créditos»</strong>: unidade interna não monetária atribuída a cada plano de assinatura, consumida ao usar as funções de geração de conteúdo com IA.</li>
            <li><strong>«Plataformas de terceiros»</strong>: redes sociais externas como TikTok, Instagram, Facebook ou outras conectadas via OAuth.</li>
            <li><strong>«Plano»</strong>: nível de assinatura contratado (Free, Starter, Business ou Agency).</li>
          </ul>
        </>,
      },
      {
        id: "s2", title: "2. Aceitação dos termos",
        body: <>
          <div className={S.warn}>Ao criar uma conta ou usar o hazpost, o Usuário declara ter lido, compreendido e aceito integralmente estes Termos. Caso não concorde, deve abster-se de usar a Plataforma.</div>
          <p className={S.p}>A aceitação pode ocorrer ao clicar em "Criar conta", ao fazer login via Google OAuth ou ao começar a usar qualquer funcionalidade da Plataforma. Este acordo tem plena validade legal entre as partes.</p>
          <p className={S.p}>Para criar uma conta, o Usuário deve ter pelo menos 18 anos ou agir com autorização legal de um adulto responsável. As contas corporativas são responsabilidade do representante legal da entidade.</p>
        </>,
      },
      {
        id: "s3", title: "3. Descrição do serviço",
        body: <>
          <p className={S.p}>hazpost é uma plataforma SaaS de gestão de conteúdo para redes sociais com inteligência artificial. As funcionalidades incluem, sem limitação:</p>
          <ul className={S.ul}>
            <li>Geração automatizada de legendas, hashtags e imagens com IA.</li>
            <li>Agendamento e publicação automática no TikTok, Instagram e Facebook.</li>
            <li>Gestão de múltiplos nichos e perfis de marca.</li>
            <li>Painel de análise de desempenho de conteúdo.</li>
            <li>Fluxos de aprovação e revisão de conteúdo.</li>
            <li>Gerenciamento de contas sociais conectadas via OAuth.</li>
          </ul>
          <p className={S.p}>hazpost atua exclusivamente como ferramenta tecnológica. <strong>Não é uma agência de marketing e não garante resultados de vendas, alcance, seguidores ou engajamento</strong> em nenhuma plataforma social.</p>
        </>,
      },
      {
        id: "s4", title: "4. Planos, pagamentos e créditos",
        body: <>
          <p className={S.p}><strong>4.1 Planos disponíveis:</strong> hazpost oferece um plano gratuito (Free) com funcionalidades limitadas e planos pagos (Starter, Business, Agency) com maior capacidade. Os preços vigentes são exibidos na plataforma e podem ser atualizados com 30 dias de aviso prévio.</p>
          <p className={S.p}><strong>4.2 Ciclo de cobrança:</strong> Os planos pagos têm ciclo mensal. A cobrança é realizada no início de cada período através do processador de pagamentos integrado.</p>
          <p className={S.p}><strong>4.3 Créditos:</strong> Os créditos não utilizados ao final do período mensal <strong>não se acumulam nem são transferidos para o mês seguinte</strong>, exceto em pacotes adicionais expressamente marcados como acumuláveis.</p>
          <p className={S.p}><strong>4.4 Impostos:</strong> Os preços não incluem impostos aplicáveis. O Usuário é responsável por todos os tributos cabíveis em sua jurisdição.</p>
          <p className={S.p}><strong>4.5 Falha no pagamento:</strong> Se uma cobrança não puder ser processada, o plano passará automaticamente para o nível Free e o acesso premium será suspenso até a regularização do pagamento.</p>
        </>,
      },
      {
        id: "s5", title: "5. Política de reembolso",
        body: <>
          <div className={S.warn}><strong>As assinaturas NÃO são reembolsáveis</strong> após o processamento da cobrança do período. Os créditos consumidos não são recuperáveis.</div>
          <p className={S.p}>Poderá ser considerado um crédito em conta (não reembolso em dinheiro) apenas em caso de interrupção do serviço atribuível exclusivamente ao hazpost com duração superior a 72 horas contínuas dentro do período pago, verificada e confirmada pela equipe do hazpost.</p>
          <p className={S.p}>Reembolsos por mau funcionamento de APIs de terceiros (TikTok, Meta, Google, etc.) não são cabíveis, pois o hazpost não controla a disponibilidade dessas plataformas.</p>
        </>,
      },
      {
        id: "s6", title: "6. Acesso e contas de usuário",
        body: <>
          <p className={S.p}><strong>6.1</strong> O Usuário é responsável por manter a confidencialidade de suas credenciais. Qualquer atividade realizada a partir de sua conta é de sua inteira responsabilidade.</p>
          <p className={S.p}><strong>6.2</strong> O Usuário deve notificar imediatamente o hazpost sobre qualquer acesso não autorizado à sua conta em <a href="mailto:info@hazpost.app" className="text-primary hover:underline">info@hazpost.app</a>.</p>
          <p className={S.p}><strong>6.3</strong> Não é permitido compartilhar credenciais entre múltiplas pessoas fora da conta contratada, nem vender ou ceder o acesso a terceiros não autorizados.</p>
        </>,
      },
      {
        id: "s7", title: "7. Usos proibidos",
        body: <>
          <p className={S.p}>É estritamente proibido usar o hazpost para:</p>
          <ul className={S.ul}>
            <li>Publicar conteúdo ilegal, obsceno, difamatório, ameaçador ou que incite ao ódio.</li>
            <li>Infringir direitos de propriedade intelectual de terceiros.</li>
            <li>Realizar spam, phishing, distribuição de malware ou atividades fraudulentas.</li>
            <li>Manipular métricas de redes sociais de forma artificial (bots, compra de seguidores, etc.).</li>
            <li>Tentar acessar áreas restritas da Plataforma ou sistemas de terceiros sem autorização.</li>
            <li>Realizar engenharia reversa, descompilar ou extrair o código-fonte da Plataforma.</li>
            <li>Violar os Termos de Serviço do TikTok, Meta, Google ou outras plataformas conectadas.</li>
          </ul>
          <p className={S.p}>O descumprimento poderá resultar em suspensão ou cancelamento imediato sem direito a reembolso e, quando aplicável, em ações legais.</p>
        </>,
      },
      {
        id: "s8", title: "8. Conteúdo gerado por IA",
        body: <>
          <p className={S.p}><strong>8.1 Revisão do Usuário:</strong> O Usuário é o único responsável por revisar, aprovar e verificar o conteúdo antes de publicá-lo. A publicação sem revisão prévia é responsabilidade exclusiva do Usuário.</p>
          <p className={S.p}><strong>8.2 Sem garantia de precisão:</strong> hazpost não garante que o conteúdo gerado seja preciso, completo, livre de erros ou adequado para todos os públicos.</p>
          <p className={S.p}><strong>8.3 Propriedade:</strong> O conteúdo gerado para um Usuário pertence a esse Usuário, sujeito aos termos dos modelos de IA subjacentes. hazpost não reivindica direitos de propriedade sobre o conteúdo gerado para os Usuários.</p>
        </>,
      },
      {
        id: "s9", title: "9. Propriedade intelectual",
        body: <>
          <p className={S.p}><strong>9.1 Do hazpost:</strong> A plataforma, seu código, design, marca, logotipos, interfaces, algoritmos e metodologias são propriedade exclusiva do hazpost. O uso não transfere nenhum direito sobre esses ativos ao Usuário.</p>
          <p className={S.p}><strong>9.2 Do Usuário:</strong> O Usuário retém todos os direitos sobre o conteúdo original que carregue ou publique. Ao usar a Plataforma, concede ao hazpost uma licença limitada e não exclusiva para processar tal conteúdo exclusivamente para fins de prestação do serviço contratado.</p>
        </>,
      },
      {
        id: "s10", title: "10. Conexão com plataformas de terceiros",
        body: <>
          <p className={S.p}><strong>10.1 Autorização OAuth:</strong> Ao conectar contas do TikTok, Instagram, Facebook ou outras plataformas, o Usuário autoriza expressamente o hazpost a agir em seu nome para as ações específicas indicadas durante o processo de conexão.</p>
          <p className={S.p}><strong>10.2 Armazenamento de tokens:</strong> Os tokens de acesso são armazenados criptografados com AES-256-GCM. São usados apenas para executar as ações autorizadas e não são compartilhados com terceiros.</p>
          <p className={S.p}><strong>10.3 Responsabilidade sobre APIs externas:</strong> hazpost <strong>não se responsabiliza</strong> por interrupções, alterações ou suspensões de APIs de terceiros (TikTok, Meta, Google, etc.).</p>
          <div className={S.box}><strong>Escopos do TikTok solicitados:</strong> {code("user.info.basic")} {code("video.publish")} {code("video.upload")} — usados exclusivamente para publicar vídeos nas contas TikTok autorizadas pelo Usuário.</div>
        </>,
      },
      {
        id: "s11", title: "11. Privacidade e proteção de dados",
        body: <>
          <p className={S.p}>O tratamento de dados pessoais é regido pela nossa <a href="/privacy-policy" className="text-primary hover:underline">Política de Privacidade</a>. hazpost está em conformidade com as leis de proteção de dados aplicáveis. Os dados dos Usuários não são vendidos nem cedidos a terceiros para fins comerciais.</p>
        </>,
      },
      {
        id: "s12", title: "12. Disponibilidade do serviço (SLA)",
        body: <>
          <p className={S.p}>hazpost busca manter uma disponibilidade de <strong>95% ao mês</strong>, excluindo manutenções programadas. <strong>A disponibilidade ininterrupta ou livre de erros não é garantida.</strong></p>
          <p className={S.p}>hazpost não se responsabiliza por perdas decorrentes de publicações que não sejam executadas no prazo devido a interrupções do serviço, problemas de conectividade do Usuário ou falhas em APIs de plataformas externas.</p>
        </>,
      },
      {
        id: "s13", title: "13. Limitação de responsabilidade",
        body: <>
          <div className={S.warn}><strong>IMPORTANTE — Leia com atenção:</strong> Esta seção limita a responsabilidade máxima do hazpost perante o Usuário.</div>
          <p className={S.p}><strong>13.1</strong> A Plataforma é fornecida <strong>"no estado em que se encontra" (as-is)</strong> e <strong>"conforme disponibilidade"</strong>, sem garantias expressas ou implícitas de qualquer tipo.</p>
          <p className={S.p}><strong>13.2</strong> hazpost <strong>não será responsável</strong> por danos indiretos, incidentais, especiais, consequenciais ou punitivos, incluindo perda de lucros, clientes, danos à reputação ou perda de dados.</p>
          <p className={S.p}><strong>13.3</strong> A responsabilidade total do hazpost não excederá em nenhum caso o valor pago pelo Usuário nos últimos <strong>3 meses</strong>.</p>
        </>,
      },
      {
        id: "s14", title: "14. Indenização",
        body: <>
          <p className={S.p}>O Usuário concorda em indenizar e isentar o hazpost, seus diretores, funcionários, agentes e parceiros de qualquer reclamação, dano, perda, custo ou despesa (incluindo honorários advocatícios) decorrentes de: (a) uso do serviço; (b) conteúdo publicado; (c) violação destes Termos; (d) violação de direitos de terceiros.</p>
        </>,
      },
      {
        id: "s15", title: "15. Suspensão e rescisão",
        body: <>
          <p className={S.p}><strong>15.1 Pelo Usuário:</strong> O Usuário pode cancelar sua conta a qualquer momento. Não são realizados reembolsos proporcionais pelos dias não utilizados.</p>
          <p className={S.p}><strong>15.2 Pelo hazpost:</strong> O hazpost pode suspender ou cancelar uma conta imediatamente em caso de: violação destes Termos, atividade fraudulenta, inadimplência reiterada ou risco para a segurança da Plataforma.</p>
          <p className={S.p}><strong>15.3 Efeitos:</strong> Os dados serão mantidos por 30 dias para exportação, após o qual poderão ser excluídos permanentemente.</p>
        </>,
      },
      {
        id: "s16", title: "16. Modificações ao serviço",
        body: <>
          <p className={S.p}>hazpost pode modificar, suspender ou descontinuar funcionalidades a qualquer momento. Alterações materiais nestes Termos serão comunicadas com <strong>15 dias de antecedência</strong> por e-mail ou aviso na Plataforma. O uso continuado implica aceitação dos novos Termos.</p>
        </>,
      },
      {
        id: "s17", title: "17. Força maior",
        body: <>
          <p className={S.p}>hazpost não será responsável por atrasos ou descumprimentos causados por circunstâncias fora de seu controle razoável, incluindo desastres naturais, interrupções de energia ou internet, falhas de provedores de nuvem, mudanças regulatórias, pandemia, greves ou ataques cibernéticos de terceiros.</p>
        </>,
      },
      {
        id: "s18", title: "18. Lei aplicável e jurisdição",
        body: <>
          <p className={S.p}>Estes Termos são regidos pelas leis da <strong>República da Colômbia</strong>. As disputas serão submetidas primeiro a negociação direta de boa-fé por 30 dias e, se não resolvidas, aos juízes e tribunais competentes da cidade de <strong>Cali, Colômbia</strong>.</p>
        </>,
      },
      {
        id: "s19", title: "19. Contato",
        body: <>
          <div className={S.box}>
            <p className="font-semibold mb-2">hazpost</p>
            <p>E-mail: <a href="mailto:info@hazpost.app" className="text-primary hover:underline">info@hazpost.app</a></p>
            <p>Web: <a href="https://hazpost.app" className="text-primary hover:underline" target="_blank" rel="noreferrer">hazpost.app</a></p>
          </div>
        </>,
      },
    ],
  },
};

const langLabels: Record<Lang, string> = { es: "Español", en: "English", pt: "Português" };

export default function TermsOfService() {
  const [lang, setLang] = useState<Lang>("es");
  const { meta, sections } = content[lang];

  return (
    <div className={S.page}>
      <SeoMeta
        title="Términos de Servicio — HazPost"
        description="Lee los términos y condiciones de uso de HazPost, la plataforma de gestión de redes sociales con Inteligencia Artificial."
        canonical="https://hazpost.app/terms-of-service"
        ogUrl="https://hazpost.app/terms-of-service"
        ogImage="https://hazpost.app/opengraph.jpg"
      />
      <div className={S.wrap}>
        <div className={S.header}>
          <div className={S.logo}><span className={S.logoText}>hp</span></div>
          <div>
            <div className={S.title}><span style={{ color: "#fff" }}>haz</span><span style={{ color: "#00C2FF" }}>post</span></div>
            <h1 className={S.subtitle}>{meta.subtitle}</h1>
          </div>
        </div>
        <p className={S.updated}>{meta.updated}</p>

        <div className={S.langBar}>
          {(["es", "en", "pt"] as Lang[]).map(l => (
            <button key={l} onClick={() => setLang(l)} className={S.langBtn(lang === l)}>
              {langLabels[l]}
            </button>
          ))}
        </div>

        <div className={S.toc}>
          <p className={S.tocTitle}>{meta.toc}</p>
          <ol className={S.tocList}>
            {sections.map(s => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={S.tocItem}>{s.title}</a>
              </li>
            ))}
          </ol>
        </div>

        {sections.map(s => (
          <section key={s.id} id={s.id} className={S.section}>
            <h2 className={S.h2}>{s.title}</h2>
            {s.body}
          </section>
        ))}

        <div className={S.footer}>
          <p className={S.footerText}>© 2026 hazpost — Social Media con IA. Todos los derechos reservados.</p>
          <div className={S.links}>
            <a href="/privacy-policy" className={S.link}>Privacy Policy / Política de Privacidad</a>
            <a href="/data-deletion" className={S.link}>Data Deletion</a>
            <a href="mailto:info@hazpost.app" className={S.link}>Contact</a>
          </div>
        </div>
      </div>
    </div>
  );
}
