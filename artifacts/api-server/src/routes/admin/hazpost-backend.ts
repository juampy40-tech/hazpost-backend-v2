import { Router } from "express";

const router = Router();

const HAZPOST_BACKEND_URL = process.env.HAZPOST_BACKEND_URL || "http://localhost:5000";
const HAZPOST_BACKEND_API_KEY = process.env.HAZPOST_BACKEND_API_KEY || "";

async function proxyGet(path: string) {
  const url = `${HAZPOST_BACKEND_URL}${path}`;
  const headers: Record<string, string> = {};
  if (HAZPOST_BACKEND_API_KEY) {
    headers["X-API-Key"] = HAZPOST_BACKEND_API_KEY;
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(`hazpost-backend error ${res.status}`), { status: res.status, body: text });
  }
  return res.json();
}

async function proxyPost(path: string, body: unknown) {
  const url = `${HAZPOST_BACKEND_URL}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (HAZPOST_BACKEND_API_KEY) {
    headers["X-API-Key"] = HAZPOST_BACKEND_API_KEY;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(`hazpost-backend error ${res.status}`), { status: res.status, body: text });
  }
  return res.json();
}

async function proxyDelete(path: string) {
  const url = `${HAZPOST_BACKEND_URL}${path}`;
  const headers: Record<string, string> = {};
  if (HAZPOST_BACKEND_API_KEY) {
    headers["X-API-Key"] = HAZPOST_BACKEND_API_KEY;
  }
  const res = await fetch(url, {
    method: "DELETE",
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(`hazpost-backend error ${res.status}`), { status: res.status, body: text });
  }
  return res.json();
}

function handleError(res: import("express").Response, err: unknown) {
  const e = err as { status?: number; body?: string; message?: string };
  const status = e.status || 502;
  res.status(status).json({ error: e.message || "Error conectando a hazpost-backend", detail: e.body });
}

// ── Monitor ────────────────────────────────────────────────────────────────────
// Backend returns: { is_down, down_since, last_check, last_status_code, last_response_time_ms }
// We forward as-is — no normalization needed.

router.get("/monitor/status", async (_req, res) => {
  try {
    const data = await proxyGet("/api/monitor/");
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/monitor/check", async (_req, res) => {
  try {
    const data = await proxyPost("/api/monitor/check", {});
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/monitor/history", async (_req, res) => {
  try {
    const data = await proxyGet("/api/monitor/history");
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

// ── Duplicados ─────────────────────────────────────────────────────────────────
// Backend GET /api/duplicados/ returns: { count, threshold, pairs: [{ skill_a, skill_b, similarity, index_a, index_b }] }
// Normalized to:                        { total, threshold, duplicates: [...] }

router.get("/duplicados", async (_req, res) => {
  try {
    const raw = await proxyGet("/api/duplicados/") as { count: number; threshold: number; pairs: unknown[] };
    res.json({
      total: raw.count ?? 0,
      threshold: raw.threshold ?? 0.8,
      duplicates: raw.pairs ?? [],
    });
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/duplicados/skills", async (_req, res) => {
  try {
    const data = await proxyGet("/api/duplicados/skills");
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/duplicados/merge", async (req, res) => {
  try {
    const data = await proxyPost("/api/duplicados/merge", req.body);
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

// ── Aprendizaje Colectivo ─────────────────────────────────────────────────────
// Backend GET /api/aprendizaje/rubros returns an array: [{ rubro, sample_count, trained_at }]
// Normalized to: { rubros: [{ rubro, samples, trained_at }] }

router.get("/aprendizaje/rubros", async (_req, res) => {
  try {
    const raw = await proxyGet("/api/aprendizaje/rubros") as Array<{ rubro: string; sample_count: number; trained_at: string | null }>;
    const list = Array.isArray(raw) ? raw : [];
    res.json({
      rubros: list.map(r => ({
        rubro: r.rubro,
        samples: r.sample_count ?? 0,
        trained_at: r.trained_at,
      })),
    });
  } catch (err) {
    handleError(res, err);
  }
});

// Backend GET /api/aprendizaje/sugerencias/:rubro returns:
//   { rubro, suggested_skills, best_content_types, best_posting_hours, avg_engagement, based_on_samples, trained_at }
// Normalized to:
//   { rubro, top_skills, best_content_types, best_hours, avg_engagement, based_on_samples, trained_at }

router.get("/aprendizaje/sugerencias/:rubro", async (req, res) => {
  try {
    const raw = await proxyGet(`/api/aprendizaje/sugerencias/${encodeURIComponent(req.params.rubro)}`) as {
      rubro: string;
      suggested_skills?: string[];
      best_content_types?: string[];
      best_posting_hours?: number[];
      avg_engagement?: number;
      based_on_samples?: number;
      trained_at?: string;
    };
    res.json({
      rubro: raw.rubro,
      top_skills: raw.suggested_skills ?? [],
      best_content_types: raw.best_content_types ?? [],
      best_hours: raw.best_posting_hours ?? [],
      avg_engagement: raw.avg_engagement ?? 0,
      based_on_samples: raw.based_on_samples ?? 0,
      trained_at: raw.trained_at ?? null,
    });
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/aprendizaje/entrenar/:rubro", async (req, res) => {
  try {
    const data = await proxyPost(`/api/aprendizaje/entrenar/${encodeURIComponent(req.params.rubro)}`, {});
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

// ── Security / Blocked IPs ────────────────────────────────────────────────────

router.get("/security/blocked-ips", async (_req, res) => {
  try {
    const data = await proxyGet("/api/security/blocked-ips");
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

router.delete("/security/blocked-ips/:ip", async (req, res) => {
  try {
    const data = await proxyDelete(`/api/security/blocked-ips/${encodeURIComponent(req.params.ip)}`);
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/security/block-history", async (req, res) => {
  try {
    const limit = req.query.limit ? `?limit=${encodeURIComponent(String(req.query.limit))}` : "";
    const ip = req.query.ip ? `${limit ? "&" : "?"}ip=${encodeURIComponent(String(req.query.ip))}` : "";
    const data = await proxyGet(`/api/security/block-history${limit}${ip}`);
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

router.get("/security/failed-attempts", async (_req, res) => {
  try {
    const data = await proxyGet("/api/security/failed-attempts");
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

router.delete("/security/failed-attempts/:ip", async (req, res) => {
  try {
    const data = await proxyDelete(`/api/security/failed-attempts/${encodeURIComponent(req.params.ip)}`);
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

// ── Imágenes de Usuarios ───────────────────────────────────────────────────────

router.get("/imagenes/listar", async (req, res) => {
  try {
    const usuario = req.query.usuario ? `usuario=${encodeURIComponent(String(req.query.usuario))}` : "";
    const tipo = req.query.tipo ? `tipo=${encodeURIComponent(String(req.query.tipo))}` : "";
    const qs = [usuario, tipo].filter(Boolean).join("&");
    const data = await proxyGet(`/api/imagenes/listar${qs ? `?${qs}` : ""}`);
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

router.post("/imagenes/subir", async (req, res) => {
  try {
    const url = `${HAZPOST_BACKEND_URL}/api/imagenes/subir`;
    const headers: Record<string, string> = {};
    if (HAZPOST_BACKEND_API_KEY) headers["X-API-Key"] = HAZPOST_BACKEND_API_KEY;
    const ct = req.headers["content-type"];
    if (ct) headers["Content-Type"] = ct;

    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);

    const fetchRes = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    } as RequestInit);
    if (!fetchRes.ok) {
      const text = await fetchRes.text().catch(() => "");
      res.status(fetchRes.status).json({ error: `hazpost-backend error ${fetchRes.status}`, detail: text });
      return;
    }
    const data = await fetchRes.json();
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

router.delete("/imagenes/:usuario/:tipo/:nombre", async (req, res) => {
  try {
    const { usuario, tipo, nombre } = req.params;
    const data = await proxyDelete(
      `/api/imagenes/${encodeURIComponent(usuario)}/${encodeURIComponent(tipo)}/${encodeURIComponent(nombre)}`
    );
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
