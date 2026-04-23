import React from "react";

export default function DataDeletion() {
  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <span className="text-primary font-black text-sm">hp</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Eliminación de Datos</h1>
            <p className="text-sm text-muted-foreground">hazpost.app — Social Media con IA</p>
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-5 space-y-2">
          <h2 className="font-semibold text-primary">¿Qué datos almacenamos?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            hazpost almacena tokens de acceso OAuth de Meta (Instagram/Facebook) y TikTok para publicar contenido automáticamente en nombre de tu negocio. También guardamos el contenido generado, imágenes aprobadas e historial de publicaciones.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Cómo revocar el acceso de Meta</h2>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside leading-relaxed">
            <li>Ve a <a href="https://www.facebook.com/settings?tab=applications" className="text-primary hover:underline" target="_blank" rel="noreferrer">facebook.com/settings → Apps y sitios web</a></li>
            <li>Busca <strong className="text-foreground">hazpost</strong> en la lista</li>
            <li>Haz clic en <strong className="text-foreground">Eliminar</strong></li>
            <li>Facebook revocará el token de acceso inmediatamente</li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Solicitar eliminación completa</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Para solicitar la eliminación de todos los datos asociados a tu cuenta, envía un correo a:
          </p>
          <a
            href="mailto:info@hazpost.app?subject=Solicitud de eliminación de datos - hazpost"
            className="inline-flex items-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          >
            ✉ info@hazpost.app
          </a>
          <p className="text-xs text-muted-foreground">
            Procesamos las solicitudes en un plazo máximo de 30 días hábiles.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Datos que se eliminan</h2>
          <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
            <li>Tokens de acceso OAuth cifrados</li>
            <li>IDs de páginas y cuentas vinculadas</li>
            <li>Historial de publicaciones generadas</li>
            <li>Contenido e imágenes almacenadas</li>
            <li>Datos de perfil y configuración del negocio</li>
          </ul>
        </section>

        <div className="pt-8 border-t border-border/30 text-center space-y-1">
          <p className="text-xs text-muted-foreground">© 2026 hazpost — Social Media con IA</p>
          <a href="/privacy-policy" className="text-xs text-primary hover:underline inline-block">Ver Política de Privacidad →</a>
        </div>
      </div>
    </div>
  );
}
