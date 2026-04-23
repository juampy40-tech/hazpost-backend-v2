import React from "react";
import { SeoMeta } from "@/hooks/useSeoMeta";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4">
      <SeoMeta
        title="Política de Privacidad — HazPost"
        description="Lee la política de privacidad de HazPost. Cómo recopilamos, usamos y protegemos tu información personal al usar nuestra plataforma de redes sociales con IA."
        canonical="https://hazpost.app/privacy-policy"
        ogUrl="https://hazpost.app/privacy-policy"
        ogImage="https://hazpost.app/opengraph.jpg"
      />
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <span className="text-primary font-black text-sm">hp</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Política de Privacidad</h1>
            <p className="text-sm text-muted-foreground">hazpost.app — Social Media con IA</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">Última actualización: 9 de abril de 2026</p>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. Información que recopilamos</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            hazpost recopila únicamente la información necesaria para operar la plataforma: datos de registro (nombre, correo electrónico), tokens de acceso OAuth proporcionados por Meta (Instagram/Facebook) y TikTok, información de páginas y cuentas de negocios vinculadas, y contenido generado o aprobado por cada usuario.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">2. Cómo usamos la información</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Los tokens de acceso se utilizan exclusivamente para publicar contenido aprobado en las plataformas conectadas (Instagram, Facebook, TikTok) en nombre del negocio del usuario. No compartimos, vendemos ni transferimos datos personales a terceros.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">3. Almacenamiento de datos</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Los tokens de acceso se almacenan cifrados en una base de datos PostgreSQL segura. El contenido publicado (imágenes, textos) se almacena en object storage privado. No almacenamos datos de usuarios finales de las plataformas sociales.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">4. Permisos de Meta (Facebook/Instagram)</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Esta aplicación solicita los permisos: <code className="bg-white/10 px-1 rounded text-xs">instagram_content_publish</code>, <code className="bg-white/10 px-1 rounded text-xs">instagram_manage_insights</code>, <code className="bg-white/10 px-1 rounded text-xs">pages_show_list</code>, <code className="bg-white/10 px-1 rounded text-xs">pages_read_engagement</code>, y <code className="bg-white/10 px-1 rounded text-xs">pages_manage_posts</code>. Estos permisos se usan únicamente para publicar contenido del usuario en sus propias páginas y cuentas.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">5. Permisos de TikTok</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Esta aplicación solicita los siguientes permisos de TikTok a través de su API oficial (Content Posting API):
          </p>
          <ul className="text-sm text-muted-foreground space-y-2 list-none">
            <li><code className="bg-white/10 px-1 rounded text-xs">user.info.basic</code> — Leer información básica del perfil (nombre, open_id) para identificar la cuenta conectada.</li>
            <li><code className="bg-white/10 px-1 rounded text-xs">video.upload</code> — Subir videos como borrador a la cuenta del creador para su posterior revisión y publicación en TikTok.</li>
            <li><code className="bg-white/10 px-1 rounded text-xs">video.publish</code> — Publicar videos directamente en la cuenta de TikTok del usuario en su nombre, únicamente con contenido aprobado por el usuario dentro de hazpost.</li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Estos permisos se usan exclusivamente para publicar el contenido aprobado por el usuario en su propia cuenta de TikTok. No accedemos a datos de otros usuarios ni publicamos contenido sin aprobación explícita.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">6. Retención y eliminación</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Los tokens de acceso se pueden revocar en cualquier momento desde la configuración de la aplicación o directamente desde la configuración de seguridad de Meta o TikTok. Al revocar el acceso, los tokens son eliminados de nuestra base de datos en un plazo máximo de 30 días.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">7. Contacto</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Para preguntas sobre privacidad o solicitudes de eliminación de datos, contáctenos en: <a href="mailto:info@hazpost.app" className="text-primary hover:underline">info@hazpost.app</a> o visita <a href="https://hazpost.app" className="text-primary hover:underline" target="_blank" rel="noreferrer">hazpost.app</a>.
          </p>
        </section>

        <div className="pt-8 border-t border-border/30 text-center">
          <p className="text-xs text-muted-foreground">© 2026 hazpost — Social Media con IA</p>
          <a href="/data-deletion" className="text-xs text-primary hover:underline mt-1 inline-block">Solicitar eliminación de datos →</a>
        </div>
      </div>
    </div>
  );
}
