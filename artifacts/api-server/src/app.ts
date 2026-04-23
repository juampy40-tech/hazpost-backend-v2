import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import router from "./routes";
import { logger } from "./lib/logger";
import { leadCaptureRateLimit } from "./lib/rateLimits.js";
import { db } from "@workspace/db";
import { landingPagesTable, landingLeadsTable, imageVariantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In production: node is invoked from workspace root, so process.cwd() = workspace root.
// The build script outputs the frontend to artifacts/social-dashboard/dist/public/.
// In development: frontendDistPath is never used (static serving is production-only).
const frontendDistPath = process.env.NODE_ENV === "production"
  ? path.resolve(process.cwd(), "artifacts/social-dashboard/dist/public")
  : path.resolve(__dirname, "../../../social-dashboard/dist/public");

const app: Express = express();

// ── Proxy trust ────────────────────────────────────────────────────────────────
// Replit's infrastructure routes requests through one reverse-proxy hop.
// Setting trust proxy = 1 makes Express read the real client IP from the
// X-Forwarded-For header so that IP-based rate limiting works correctly and
// secure cookie "secure" flag is properly detected.
app.set("trust proxy", 1);

// ── Security headers (helmet) ─────────────────────────────────────────────────
// Content-Security-Policy is intentionally permissive here because the API
// serves server-rendered HTML landing pages that load external fonts/scripts.
// Tighten per-route as needed.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://www.google-analytics.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "https:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// CORS — explicit allowlist; never reflect arbitrary origins for credentialed requests.
// Add additional trusted origins via CORS_ORIGIN (comma-separated).
const EXPLICIT_ORIGINS = (process.env.CORS_ORIGIN ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);

// Always allow the configured APP_URL (custom domain in production).
if (process.env.APP_URL && !EXPLICIT_ORIGINS.includes(process.env.APP_URL)) {
  EXPLICIT_ORIGINS.push(process.env.APP_URL);
}

const DEV_ORIGIN_PATTERNS = [/\.replit\.dev$/, /\.repl\.co$/, /^https?:\/\/localhost(:\d+)?$/];
// replit.app is always the production deployment domain for Replit-hosted apps.
// hazpost.app is the custom production domain.
const PROD_ORIGIN_PATTERNS = [/\.replit\.app$/, /hazpost\.app$/];

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin / server-to-server requests have no Origin header — always allow.
    if (!origin) return callback(null, true);
    if (EXPLICIT_ORIGINS.includes(origin)) return callback(null, true);
    // Always allow Replit deployment domains (*.replit.app).
    if (PROD_ORIGIN_PATTERNS.some(p => p.test(origin))) return callback(null, true);
    // In development also allow Replit preview domains.
    if (process.env.NODE_ENV !== "production" && DEV_ORIGIN_PATTERNS.some(p => p.test(origin))) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));
app.use(cookieParser());
// Default body limits — conservative for security on non-upload routes.
// Upload routes (/api/media, /api/backgrounds, /api/posts/*/add-raw-slide) declare
// their own higher limit inline via route-level middleware.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// TikTok domain verification file
app.get("/tiktokaIaVoUa9Emo8toL60ap8NBLyqCMyp8YY.txt", (_req, res) => {
  res.type("text/plain").send("tiktok-developers-site-verification=aIaVoUa9Emo8toL60ap8NBLyqCMyp8YY");
});

// Static marketing landing page for hazpost.app (paste into WordPress or preview directly)
app.get("/lp/landing-page", (_req, res) => {
  res.sendFile(path.resolve(__dirname, "../public/landing.html"));
});

// WordPress-compatible version (no DOCTYPE/html/head/body wrappers — paste directly into WP code editor)
app.get("/lp/landing-wp", (_req, res) => {
  res.type("text/html").sendFile(path.resolve(__dirname, "../public/landing-wp.html"));
});

// Public landing page routes — served as HTML, outside /api
app.get("/lp/:slug", async (req, res) => {
  const { slug } = req.params;
  const editMode = req.query.edit === "true";
  const [landing] = await db.select().from(landingPagesTable).where(eq(landingPagesTable.slug, slug));
  if (!landing || landing.status === "archived") {
    return res.status(404).send("<!DOCTYPE html><html><head><title>No encontrada</title></head><body style=\"font-family:sans-serif;text-align:center;padding:80px;\"><h1>Página no encontrada</h1><p><a href=\"https://eco-col.com\">Ir a eco-col.com</a></p></body></html>");
  }

  let html = landing.generatedHtml;

  // If a hero image has been generated for this landing, overlay it on the #eco-hero section via CSS injection
  if (landing.heroImageVariantId) {
    const heroCss = `<style>#eco-hero{background:linear-gradient(135deg,rgba(10,14,26,.72) 0%,rgba(13,27,62,.65) 55%,rgba(0,21,80,.70) 100%),url('/lp/${slug}/hero-image') center/cover no-repeat!important}</style>`;
    html = html.replace("</head>", heroCss + "\n</head>");
  }

  // Inject visual editor if ?edit=true or triple-click footer trigger
  if (editMode) {
    const editorCss = `
<style id="eco-editor-styles">
#eco-edit-bar{position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#0a0e1a,#0d1b3e);border-bottom:3px solid #0077FF;padding:10px 20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-family:'Poppins',sans-serif;box-shadow:0 4px 24px rgba(0,119,255,.35);}
#eco-edit-bar .eco-eb-logo{color:white;font-weight:900;font-size:1rem;margin-right:8px;white-space:nowrap;}
#eco-edit-bar .eco-eb-logo span{color:#00C2FF;}
#eco-edit-bar .eco-eb-badge{background:#0077FF;color:white;font-size:.65rem;font-weight:800;padding:2px 8px;border-radius:50px;letter-spacing:.06em;text-transform:uppercase;}
#eco-edit-bar .eco-eb-sep{width:1px;height:28px;background:rgba(255,255,255,.15);}
#eco-edit-bar button{cursor:pointer;border:none;font-family:inherit;font-weight:700;font-size:.78rem;border-radius:8px;padding:7px 14px;transition:all .15s;}
#eco-edit-bar .eco-btn-save{background:linear-gradient(135deg,#0077FF,#00C2FF);color:white;}
#eco-edit-bar .eco-btn-save:hover{opacity:.88;}
#eco-edit-bar .eco-btn-cancel{background:rgba(255,255,255,.1);color:rgba(255,255,255,.7);}
#eco-edit-bar .eco-btn-cancel:hover{background:rgba(255,255,255,.18);color:white;}
#eco-edit-bar .eco-btn-history{background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);}
#eco-edit-bar .eco-btn-history:hover{background:rgba(255,255,255,.14);color:white;}
#eco-edit-bar .eco-btn-export{background:rgba(0,194,255,.15);color:#00C2FF;}
#eco-edit-bar .eco-btn-export:hover{background:rgba(0,194,255,.25);}
#eco-edit-bar .eco-edit-status{color:rgba(255,255,255,.45);font-size:.72rem;margin-left:auto;}
#eco-edit-bar .eco-edit-hint{color:rgba(255,255,255,.35);font-size:.68rem;}
body.eco-editing{padding-top:60px!important;}
[data-eco-edit]{outline:none;transition:box-shadow .15s,background .15s;border-radius:4px;}
[data-eco-edit]:focus{box-shadow:0 0 0 2px #0077FF,0 0 0 4px rgba(0,119,255,.2)!important;background:rgba(0,119,255,.04)!important;outline:none;}
[data-eco-edit]:hover:not(:focus){box-shadow:0 0 0 1px rgba(0,119,255,.4);background:rgba(0,119,255,.02);}
#eco-versions-panel{display:none;position:fixed;top:60px;right:20px;z-index:99998;background:#0d1b3e;border:1px solid #0077FF;border-radius:16px;padding:20px;width:300px;box-shadow:0 8px 40px rgba(0,0,0,.5);font-family:'Poppins',sans-serif;}
#eco-versions-panel h4{color:white;font-size:.85rem;font-weight:800;margin:0 0 14px;display:flex;align-items:center;justify-content:space-between;}
#eco-versions-panel h4 button{background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:1.1rem;padding:0;}
.eco-ver-item{background:rgba(255,255,255,.05);border-radius:10px;padding:10px 14px;margin-bottom:8px;cursor:pointer;border:1px solid rgba(255,255,255,.08);transition:border-color .15s;}
.eco-ver-item:hover{border-color:#0077FF;}
.eco-ver-item .eco-ver-date{font-size:.72rem;color:#00C2FF;font-weight:600;}
.eco-ver-item .eco-ver-label{font-size:.78rem;color:rgba(255,255,255,.7);margin-top:2px;}
.eco-ver-restore{background:#0077FF;color:white;border:none;font-size:.7rem;font-weight:700;padding:4px 10px;border-radius:6px;cursor:pointer;margin-top:6px;}
#eco-save-toast{display:none;position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:99999;background:#22c55e;color:white;font-family:'Poppins',sans-serif;font-weight:700;font-size:.88rem;padding:12px 28px;border-radius:50px;box-shadow:0 4px 20px rgba(34,197,94,.4);}
</style>`;

    const editorJs = `
<script id="eco-editor-script">
(function(){
  const LANDING_ID = ${landing.id};
  const SLUG = '${slug}';
  const STORAGE_KEY = 'eco_editor_versions_' + SLUG;
  const MAX_VERSIONS = 5;
  let originalHtml = '';
  let isDirty = false;

  // Build toolbar
  const bar = document.createElement('div');
  bar.id = 'eco-edit-bar';
  bar.innerHTML = \`
    <div class="eco-eb-logo">ECO <span>⚡</span></div>
    <span class="eco-eb-badge">Editor Activo</span>
    <div class="eco-eb-sep"></div>
    <button class="eco-btn-save" id="eco-btn-save">💾 Guardar cambios</button>
    <button class="eco-btn-history" id="eco-btn-history">🕐 Versiones</button>
    <button class="eco-btn-export" id="eco-btn-export">⬇ Descargar HTML</button>
    <button class="eco-btn-cancel" id="eco-btn-cancel">✕ Salir del editor</button>
    <span class="eco-edit-status" id="eco-edit-status">Haz clic en cualquier texto para editar</span>
  \`;
  document.body.prepend(bar);
  document.body.classList.add('eco-editing');

  // Build versions panel
  const vPanel = document.createElement('div');
  vPanel.id = 'eco-versions-panel';
  vPanel.innerHTML = \`
    <h4>Historial de versiones <button id="eco-vp-close">✕</button></h4>
    <div id="eco-versions-list"></div>
    <p style="color:rgba(255,255,255,.3);font-size:.68rem;margin:8px 0 0;">Últimas \${MAX_VERSIONS} versiones guardadas</p>
  \`;
  document.body.appendChild(vPanel);

  // Toast
  const toast = document.createElement('div');
  toast.id = 'eco-save-toast';
  document.body.appendChild(toast);

  function showToast(msg, ok = true) {
    toast.textContent = msg;
    toast.style.display = 'block';
    toast.style.background = ok ? '#22c55e' : '#ef4444';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
  }

  // Make text elements editable
  const EDITABLE_SELECTORS = [
    'h1','h2','h3','h4',
    'p:not(#eco-edit-bar p)',
    'li:not(#eco-edit-bar li)',
    'a[href="#cotizar"]',
    'td','th',
    'section .badge',
    'button.faq-btn span[itemprop="name"]',
    'span[itemprop="text"]',
  ].join(',');

  // Save original
  originalHtml = document.documentElement.outerHTML;

  document.querySelectorAll(EDITABLE_SELECTORS).forEach(function(el) {
    if (el.closest('#eco-edit-bar') || el.closest('#eco-versions-panel') || el.closest('#eco-save-toast')) return;
    if (el.closest('[id^="eco-editor"]')) return;
    // Skip elements that only contain other block elements
    const text = el.textContent.trim();
    if (!text) return;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-eco-edit', '1');
    el.setAttribute('data-eco-orig', el.innerHTML);
    el.addEventListener('input', function() {
      isDirty = true;
      document.getElementById('eco-edit-status').textContent = '● Cambios sin guardar';
      document.getElementById('eco-edit-status').style.color = '#f59e0b';
    });
  });

  // Versions storage
  function getVersions() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ return []; }
  }
  function saveVersion(label) {
    const versions = getVersions();
    versions.unshift({
      date: new Date().toLocaleString('es-CO'),
      label: label || 'Versión guardada',
      html: '<!DOCTYPE html>' + document.documentElement.outerHTML.replace(/<script id="eco-editor-script"[\\s\\S]*?<\\/script>/,'').replace(/<style id="eco-editor-styles">[\\s\\S]*?<\\/style>/,'').replace(/<div id="eco-edit-bar"[\\s\\S]*?<\\/div>/,'').replace(/ data-eco-edit="1"/g,'').replace(/ data-eco-orig="[^"]*"/g,'').replace(/ contenteditable="true"/g,'').replace(/\\s*class="eco-editing"/,'')
    });
    if (versions.length > MAX_VERSIONS) versions.pop();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
  }
  function renderVersions() {
    const list = document.getElementById('eco-versions-list');
    const versions = getVersions();
    if (!versions.length) { list.innerHTML = '<p style="color:rgba(255,255,255,.35);font-size:.78rem;">Aún no hay versiones guardadas.</p>'; return; }
    list.innerHTML = versions.map(function(v, i) {
      return '<div class="eco-ver-item" data-idx="'+i+'"><div class="eco-ver-date">'+v.date+'</div><div class="eco-ver-label">'+v.label+'</div><button class="eco-ver-restore" data-idx="'+i+'">Restaurar esta versión</button></div>';
    }).join('');
    list.querySelectorAll('.eco-ver-restore').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const idx = parseInt(this.getAttribute('data-idx'));
        const v = getVersions()[idx];
        if (v && confirm('¿Restaurar esta versión? Los cambios actuales se perderán.')) {
          document.open(); document.write(v.html); document.close();
        }
      });
    });
  }

  // Clean HTML for saving (remove editor UI)
  function getCleanHtml() {
    const clone = document.documentElement.cloneNode(true);
    // Remove editor elements from clone
    const toRemove = clone.querySelectorAll('#eco-edit-bar,#eco-versions-panel,#eco-save-toast,#eco-editor-styles,#eco-editor-script');
    toRemove.forEach(function(el){ el.remove(); });
    // Remove contenteditable attrs
    clone.querySelectorAll('[contenteditable]').forEach(function(el){
      el.removeAttribute('contenteditable');
      el.removeAttribute('data-eco-edit');
      el.removeAttribute('data-eco-orig');
    });
    // Remove editor body class
    clone.body.classList.remove('eco-editing');
    return '<!DOCTYPE html>\\n' + clone.outerHTML;
  }

  // Save to backend
  document.getElementById('eco-btn-save').addEventListener('click', async function() {
    const btn = this;
    btn.textContent = '⏳ Guardando...';
    btn.disabled = true;
    const cleanHtml = getCleanHtml();
    try {
      const r = await fetch('/api/landings/'+LANDING_ID+'/html', {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ html: cleanHtml })
      });
      if (r.ok) {
        saveVersion('Guardado manual');
        isDirty = false;
        showToast('✓ Cambios guardados correctamente');
        document.getElementById('eco-edit-status').textContent = '✓ Guardado';
        document.getElementById('eco-edit-status').style.color = '#22c55e';
      } else {
        showToast('✗ Error al guardar. Intenta de nuevo.', false);
      }
    } catch(e) {
      showToast('✗ Error de red. Intenta de nuevo.', false);
    }
    btn.textContent = '💾 Guardar cambios';
    btn.disabled = false;
  });

  // Export HTML
  document.getElementById('eco-btn-export').addEventListener('click', function() {
    const html = getCleanHtml();
    const blob = new Blob([html], {type:'text/html'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'landing-eco-' + SLUG + '.html';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('⬇ HTML descargado');
  });

  // Version history panel
  document.getElementById('eco-btn-history').addEventListener('click', function() {
    const p = document.getElementById('eco-versions-panel');
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
    if (p.style.display === 'block') renderVersions();
  });
  document.getElementById('eco-vp-close').addEventListener('click', function() {
    document.getElementById('eco-versions-panel').style.display = 'none';
  });

  // Cancel / exit editor
  document.getElementById('eco-btn-cancel').addEventListener('click', function() {
    if (isDirty && !confirm('Tienes cambios sin guardar. ¿Seguro que quieres salir del editor?')) return;
    const url = new URL(location.href);
    url.searchParams.delete('edit');
    location.href = url.toString();
  });

  // Triple-click on footer activates editor (for pages served without ?edit=true)
  document.addEventListener('click', function(e) {
    if (!document.body.classList.contains('eco-editing')) {
      const footer = document.querySelector('footer');
      if (footer && footer.contains(e.target) && e.detail === 3) {
        const url = new URL(location.href);
        url.searchParams.set('edit', 'true');
        location.href = url.toString();
      }
    }
  });

  // Warn before leaving with unsaved changes
  window.addEventListener('beforeunload', function(e) {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
})();
</script>`;

    html = html.replace("</head>", editorCss + "\n</head>");
    html = html.replace("</body>", editorJs + "\n</body>");
  } else {
    // Triple-click footer activator (always present, lightweight)
    const triggerJs = `<script>(function(){document.addEventListener('click',function(e){const f=document.querySelector('footer');if(f&&f.contains(e.target)&&e.detail===3){const u=new URL(location.href);u.searchParams.set('edit','true');location.href=u.toString();}});}());</script>`;
    html = html.replace("</body>", triggerJs + "\n</body>");
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

// Serve landing hero image (JPEG bytes stored in image_variants)
app.get("/lp/:slug/hero-image", async (req, res) => {
  const { slug } = req.params;
  const [landing] = await db
    .select({ heroImageVariantId: landingPagesTable.heroImageVariantId })
    .from(landingPagesTable)
    .where(eq(landingPagesTable.slug, slug));

  if (!landing?.heroImageVariantId) return res.status(404).end();

  const [variant] = await db
    .select({ imageData: imageVariantsTable.imageData })
    .from(imageVariantsTable)
    .where(eq(imageVariantsTable.id, landing.heroImageVariantId));

  if (!variant?.imageData) return res.status(404).end();

  const buf = Buffer.from(variant.imageData, "base64");
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  return res.send(buf);
});

// Lead capture for a landing page (form submission)
// Rate-limited to prevent spam bots. Inputs are sanitized (length caps, string coercion).
app.post("/lp/:slug/lead", leadCaptureRateLimit, async (req, res) => {
  const { slug } = req.params;
  const [landing] = await db.select({ id: landingPagesTable.id }).from(landingPagesTable).where(eq(landingPagesTable.slug, slug));
  if (!landing) return res.status(404).json({ error: "Landing not found" });

  // Sanitize: coerce to string, trim whitespace, cap length to avoid DB abuse.
  const sanitize = (v: unknown, max: number) =>
    String(v ?? "").trim().slice(0, max);

  const name  = sanitize(req.body?.name,  120);
  const phone = sanitize(req.body?.phone,  40);
  const email = sanitize(req.body?.email, 255);
  const city  = sanitize(req.body?.city,   80);

  await db.insert(landingLeadsTable).values({
    landingId: landing.id,
    name,
    phone,
    email,
    city,
  });
  return res.json({ success: true });
});

// Serve brand assets (logos, fonts) publicly at /api/static/*
// This path is stored in businesses.logo_url so the frontend and image pipeline can resolve logos.
const assetsDir = path.resolve(__dirname, "../assets");
app.use("/api/static", express.static(assetsDir, { maxAge: "7d" }));

app.use("/api", router);

// Serve the chat widget JS file publicly (needed for WordPress embed)
const widgetDir = path.resolve(__dirname, "../public");
app.use(express.static(widgetDir, { maxAge: "1d" }));

// Serve the React frontend in production
if (process.env.NODE_ENV === "production") {
  const indexHtml = path.join(frontendDistPath, "index.html");
  // Log at startup so we can confirm the path in deployment logs
  import("fs").then(({ existsSync }) => {
    logger.info({ frontendDistPath, indexExists: existsSync(indexHtml) }, "frontend static files config");
  });
  app.use(express.static(frontendDistPath));
  app.use((_req, res) => {
    res.sendFile(indexHtml, (err) => {
      if (err) {
        logger.error({ err, indexHtml }, "sendFile failed — index.html not found");
        res.status(500).send(`Frontend not built. Expected: ${indexHtml}`);
      }
    });
  });
}

// ── Global error handler ──────────────────────────────────────────────────────
// Must be registered AFTER all routes (4-argument signature required by Express).
// In production: never expose stack traces, tokens, or internal error details.
// In development: pass the stack for easier debugging.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { status?: number; statusCode?: number })?.statusCode
    ?? 500;

  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Error interno del servidor";

  // Sanitize: never leak password/token strings from error messages.
  const safeMessage = message
    .replace(/password[^\s]*/gi, "[REDACTED]")
    .replace(/token[^\s]*/gi, "[REDACTED]")
    .replace(/secret[^\s]*/gi, "[REDACTED]");

  const body: Record<string, unknown> = { error: safeMessage };

  if (process.env.NODE_ENV !== "production" && err instanceof Error && err.stack) {
    body.stack = err.stack;
  }

  logger.error({ err, url: req.url, method: req.method, status }, "Unhandled error");

  res.status(status).json(body);
});

export default app;
