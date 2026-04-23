import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Link } from "wouter";
import {
  Activity, ArrowLeft, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, GitMerge, Lightbulb, ChevronDown, ChevronRight,
  Clock, Loader2, Shield, Trash2, History, ChevronLeft, RotateCcw, ShieldAlert,
  Upload, Images, FileImage,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

type MonitorStatus = {
  is_down: boolean;
  down_since: string | null;
  last_status_code: number | null;
  last_response_time_ms: number | null;
  last_check: string | null;
};

type DuplicatePair = {
  skill_a: string;
  skill_b: string;
  similarity: number;
  index_a: number;
  index_b: number;
};

type DuplicatesResponse = {
  duplicates: DuplicatePair[];
  threshold: number;
  total: number;
};

type Rubro = {
  rubro: string;
  samples: number;
};

type Sugerencias = {
  rubro: string;
  top_skills: string[];
  best_content_types: string[];
  best_hours: number[];
};

function StatusBadge({ isDown }: { isDown: boolean }) {
  if (isDown) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
        <XCircle className="w-4 h-4" />
        Caído
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
      <CheckCircle2 className="w-4 h-4" />
      En línea
    </span>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-white/[0.03]">
        <Icon className="w-5 h-5 text-[#00C2FF]" />
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function MonitorSection() {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/monitor/status`, { credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setStatus(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar estado del monitor");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  async function manualCheck() {
    setChecking(true);
    try {
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/monitor/check`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setStatus(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error en verificación manual");
    } finally {
      setChecking(false);
    }
  }

  return (
    <SectionCard title="Estado del Monitor" icon={Activity}>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error} — El servicio hazpost-backend puede no estar corriendo.</span>
        </div>
      ) : status ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-4">
            <StatusBadge isDown={status.is_down} />
            {status.last_response_time_ms !== null && (
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {status.last_response_time_ms} ms
              </span>
            )}
            {status.last_status_code !== null && (
              <span className="text-sm text-muted-foreground">
                HTTP {status.last_status_code}
              </span>
            )}
          </div>

          {status.is_down && status.down_since && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              Caído desde: {new Date(status.down_since).toLocaleString("es-CO")}
            </div>
          )}

          {status.last_check && (
            <p className="text-xs text-muted-foreground">
              Última verificación: {new Date(status.last_check).toLocaleString("es-CO")}
            </p>
          )}

          <button
            onClick={manualCheck}
            disabled={checking}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Verificar ahora
          </button>
        </div>
      ) : null}
    </SectionCard>
  );
}

function DuplicadosSection() {
  const [data, setData] = useState<DuplicatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [mergedCount, setMergedCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/duplicados`, { credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const d = await res.json();
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar duplicados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function merge(pair: DuplicatePair, keep: "a" | "b") {
    const key = `${pair.index_a}-${pair.index_b}`;
    setMerging(key);
    try {
      const body = keep === "a"
        ? { index_keep: pair.index_a, index_remove: pair.index_b }
        : { index_keep: pair.index_b, index_remove: pair.index_a };
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/duplicados/merge`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`);
      setMergedCount(c => c + 1);
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error al fusionar");
    } finally {
      setMerging(null);
    }
  }

  const visiblePairs = data?.duplicates ?? [];

  return (
    <SectionCard title="Skills Duplicadas" icon={GitMerge}>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Umbral de similitud: <strong className="text-white">{Math.round((data.threshold ?? 0.8) * 100)}%</strong></span>
            <span>·</span>
            <span>Pares detectados: <strong className="text-white">{data.total}</strong></span>
            {mergedCount > 0 && (
              <>
                <span>·</span>
                <span className="text-green-400">{mergedCount} fusionadas en esta sesión</span>
              </>
            )}
            <button onClick={load} className="ml-auto inline-flex items-center gap-1 text-xs text-[#00C2FF] hover:underline">
              <RefreshCw className="w-3 h-3" /> Actualizar
            </button>
          </div>

          {visiblePairs.length === 0 ? (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              No hay duplicados pendientes.
            </div>
          ) : (
            <div className="space-y-3">
              {visiblePairs.map(pair => {
                const key = `${pair.index_a}-${pair.index_b}`;
                const isMerging = merging === key;
                return (
                  <div key={key} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium text-white">{pair.skill_a}</p>
                        <p className="text-xs text-muted-foreground">Skill A (índice {pair.index_a})</p>
                      </div>
                      <div className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/20 shrink-0">
                        {Math.round(pair.similarity * 100)}% similar
                      </div>
                      <div className="flex-1 space-y-1 text-right">
                        <p className="text-sm font-medium text-white">{pair.skill_b}</p>
                        <p className="text-xs text-muted-foreground">Skill B (índice {pair.index_b})</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground mr-1">Conservar:</span>
                      <button
                        onClick={() => merge(pair, "a")}
                        disabled={isMerging}
                        className="flex-1 py-1.5 text-xs rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/20 transition-colors disabled:opacity-50"
                      >
                        {isMerging ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : `← ${pair.skill_a}`}
                      </button>
                      <button
                        onClick={() => merge(pair, "b")}
                        disabled={isMerging}
                        className="flex-1 py-1.5 text-xs rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/20 transition-colors disabled:opacity-50"
                      >
                        {isMerging ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : `${pair.skill_b} →`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}

function AprendizajeSection() {
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sugerencias, setSugerencias] = useState<Record<string, Sugerencias>>({});
  const [loadingSug, setLoadingSug] = useState<string | null>(null);
  const [training, setTraining] = useState<string | null>(null);
  const [trainingError, setTrainingError] = useState<Record<string, string>>({});
  const [sugError, setSugError] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BASE}/api/admin/hazpost-backend/aprendizaje/rubros`, { credentials: "include" });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const d = await res.json();
        setRubros(d.rubros ?? d);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Error al cargar rubros");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleRubro(rubro: string) {
    if (expanded === rubro) {
      setExpanded(null);
      return;
    }
    setExpanded(rubro);
    if (sugerencias[rubro]) return;
    setLoadingSug(rubro);
    setSugError(prev => { const c = { ...prev }; delete c[rubro]; return c; });
    try {
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/aprendizaje/sugerencias/${encodeURIComponent(rubro)}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text().catch(() => "")}`);
      const d = await res.json();
      setSugerencias(prev => ({ ...prev, [rubro]: d }));
    } catch (e: unknown) {
      setSugError(prev => ({ ...prev, [rubro]: e instanceof Error ? e.message : "Error al cargar sugerencias" }));
    } finally {
      setLoadingSug(null);
    }
  }

  async function train(rubro: string) {
    setTraining(rubro);
    setTrainingError(prev => { const c = { ...prev }; delete c[rubro]; return c; });
    try {
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/aprendizaje/entrenar/${encodeURIComponent(rubro)}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text().catch(() => "")}`);
      setSugerencias(prev => {
        const copy = { ...prev };
        delete copy[rubro];
        return copy;
      });
    } catch (e: unknown) {
      setTrainingError(prev => ({ ...prev, [rubro]: e instanceof Error ? e.message : "Error al entrenar" }));
    } finally {
      setTraining(null);
    }
  }

  return (
    <SectionCard title="Aprendizaje Colectivo por Rubro" icon={Lightbulb}>
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : rubros.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay rubros con datos de aprendizaje aún.</p>
      ) : (
        <div className="space-y-2">
          {rubros.map(r => (
            <div key={r.rubro} className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
              <button
                onClick={() => toggleRubro(r.rubro)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expanded === r.rubro
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  }
                  <span className="text-sm font-medium text-white capitalize">{r.rubro}</span>
                </div>
                <span className="text-xs text-muted-foreground">{r.samples} muestras</span>
              </button>

              {expanded === r.rubro && (
                <div className="border-t border-white/10 px-4 pb-4 pt-3 space-y-4">
                  {loadingSug === r.rubro ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Cargando sugerencias...
                    </div>
                  ) : sugError[r.rubro] ? (
                    <div className="flex items-center gap-2 text-amber-400 text-sm">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{sugError[r.rubro]}</span>
                    </div>
                  ) : sugerencias[r.rubro] ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-[#00C2FF] uppercase tracking-wider mb-2">Top Skills</p>
                        {sugerencias[r.rubro].top_skills.length ? (
                          <ul className="space-y-1">
                            {sugerencias[r.rubro].top_skills.map((s, i) => (
                              <li key={i} className="text-sm text-white/80 flex items-start gap-1.5">
                                <span className="text-[#00C2FF] font-bold shrink-0">{i + 1}.</span> {s}
                              </li>
                            ))}
                          </ul>
                        ) : <p className="text-xs text-muted-foreground">Sin datos</p>}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#00C2FF] uppercase tracking-wider mb-2">Tipos de Contenido</p>
                        {sugerencias[r.rubro].best_content_types.length ? (
                          <ul className="space-y-1">
                            {sugerencias[r.rubro].best_content_types.map((t, i) => (
                              <li key={i} className="text-sm text-white/80 capitalize">{t}</li>
                            ))}
                          </ul>
                        ) : <p className="text-xs text-muted-foreground">Sin datos</p>}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#00C2FF] uppercase tracking-wider mb-2">Mejores Horarios</p>
                        {sugerencias[r.rubro].best_hours.length ? (
                          <div className="flex flex-wrap gap-2">
                            {sugerencias[r.rubro].best_hours.map(h => (
                              <span key={h} className="px-2 py-0.5 rounded-full text-xs bg-violet-500/20 text-violet-300 border border-violet-500/20">
                                {String(h).padStart(2, "0")}:00
                              </span>
                            ))}
                          </div>
                        ) : <p className="text-xs text-muted-foreground">Sin datos</p>}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => train(r.rubro)}
                      disabled={training === r.rubro}
                      className="self-start inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors disabled:opacity-50"
                    >
                      {training === r.rubro ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Re-entrenar modelo
                    </button>
                    {trainingError[r.rubro] && (
                      <div className="flex items-center gap-1.5 text-red-400 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{trainingError[r.rubro]}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

type BlockedIP = {
  ip: string;
  block_type: 'temporary' | 'permanent';
  expires_at: string | null;
  remaining_seconds: number | null;
  failed_attempts: number;
};

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'expirado';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function BlockedIPsSection() {
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/security/blocked-ips`, { credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setBlockedIPs(data.blocked_ips ?? []);
      setTotal(data.total ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar IPs bloqueadas");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleUnblock(ip: string) {
    setUnblocking(ip);
    try {
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/security/blocked-ips/${encodeURIComponent(ip)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await load(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al desbloquear IP");
    } finally {
      setUnblocking(null);
    }
  }

  return (
    <SectionCard title="IPs Bloqueadas por Fuerza Bruta" icon={Shield}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? "Cargando..." : `${total} IP${total !== 1 ? "s" : ""} bloqueada${total !== 1 ? "s" : ""} actualmente`}
          </p>
          <button
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Actualizar
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && blockedIPs.length === 0 && (
          <div className="flex items-center gap-2 text-green-400 text-sm py-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>No hay IPs bloqueadas en este momento.</span>
          </div>
        )}

        {blockedIPs.length > 0 && (
          <div className="rounded-xl overflow-hidden border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.04] border-b border-white/10">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">IP</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Intentos</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expira en</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {blockedIPs.map((entry) => (
                  <tr key={entry.ip} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-white text-xs">{entry.ip}</td>
                    <td className="px-4 py-3">
                      {entry.block_type === 'temporary' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">
                          <Clock className="w-3 h-3" />
                          Temporal
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25">
                          <XCircle className="w-3 h-3" />
                          Permanente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{entry.failed_attempts}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {entry.remaining_seconds !== null
                        ? formatRemaining(entry.remaining_seconds)
                        : <span className="text-red-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleUnblock(entry.ip)}
                        disabled={unblocking === entry.ip}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-xs font-medium text-red-400 border border-red-500/20 transition-colors disabled:opacity-50"
                      >
                        {unblocking === entry.ip ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        Desbloquear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

type FailedAttemptEntry = {
  ip: string;
  count: number;
  threshold: number;
  remaining_to_block: number;
  is_blocked: boolean;
  window_resets_in: number;
};

function FailedAttemptsSection() {
  const [entries, setEntries] = useState<FailedAttemptEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/security/failed-attempts`, { credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setEntries(data.failed_attempts ?? []);
      setTotal(data.total ?? 0);
      if (data.threshold) setThreshold(data.threshold);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar intentos fallidos");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 20_000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleReset(ip: string) {
    setResetting(ip);
    try {
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/security/failed-attempts/${encodeURIComponent(ip)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      await load(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al resetear intentos");
    } finally {
      setResetting(null);
    }
  }

  function riskColor(count: number, thr: number) {
    const ratio = count / thr;
    if (ratio >= 0.8) return "text-red-400";
    if (ratio >= 0.5) return "text-amber-400";
    return "text-green-400";
  }

  function progressBg(count: number, thr: number) {
    const ratio = count / thr;
    if (ratio >= 0.8) return "bg-red-500";
    if (ratio >= 0.5) return "bg-amber-500";
    return "bg-green-500";
  }

  return (
    <SectionCard title="Intentos Fallidos de Autenticación" icon={ShieldAlert}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Cargando..."
              : `${total} IP${total !== 1 ? "s" : ""} con intentos fallidos recientes · Umbral de bloqueo: ${threshold}`}
          </p>
          <button
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Actualizar
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="flex items-center gap-2 text-green-400 text-sm py-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>No hay IPs con intentos fallidos recientes.</span>
          </div>
        )}

        {entries.length > 0 && (
          <div className="rounded-xl overflow-hidden border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.04] border-b border-white/10">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">IP</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Intentos</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Progreso</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {entries.map((entry) => (
                  <tr key={entry.ip} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-mono text-white text-xs">{entry.ip}</td>
                    <td className={`px-4 py-3 font-semibold text-sm tabular-nums ${riskColor(entry.count, entry.threshold)}`}>
                      {entry.count} / {entry.threshold}
                    </td>
                    <td className="px-4 py-3 w-40">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${progressBg(entry.count, entry.threshold)}`}
                            style={{ width: `${Math.min(100, (entry.count / entry.threshold) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {entry.remaining_to_block > 0
                            ? `faltan ${entry.remaining_to_block}`
                            : "en umbral"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {entry.is_blocked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25">
                          <XCircle className="w-3 h-3" />
                          Bloqueada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/25">
                          <Clock className="w-3 h-3" />
                          {entry.window_resets_in > 0 ? `resetea en ${entry.window_resets_in}s` : "activa"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleReset(entry.ip)}
                        disabled={resetting === entry.ip || entry.is_blocked}
                        title={entry.is_blocked ? "Primero desbloquea la IP" : "Resetear contador de intentos"}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white border border-white/15 transition-colors disabled:opacity-40"
                      >
                        {resetting === entry.ip ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Resetear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

type BlockEvent = {
  ip: string;
  event: 'blocked' | 'unblocked';
  timestamp: string;
  origin: 'automatic' | 'manual';
};

const HISTORY_PAGE_SIZE = 20;

function BlockHistorySection() {
  const [events, setEvents] = useState<BlockEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/security/block-history?limit=500`, { credentials: "include" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
      setPage(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al cargar historial");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pageCount = Math.max(1, Math.ceil(events.length / HISTORY_PAGE_SIZE));
  const pageEvents = events.slice(page * HISTORY_PAGE_SIZE, (page + 1) * HISTORY_PAGE_SIZE);

  return (
    <SectionCard title="Historial de Bloqueos" icon={History}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? "Cargando..." : `${total} evento${total !== 1 ? "s" : ""} registrado${total !== 1 ? "s" : ""}`}
          </p>
          <button
            onClick={() => load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Actualizar
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <History className="w-4 h-4 shrink-0" />
            <span>No hay eventos registrados aún. Los bloqueos y desbloqueos aparecerán aquí.</span>
          </div>
        )}

        {pageEvents.length > 0 && (
          <div className="rounded-xl overflow-hidden border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.04] border-b border-white/10">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fecha y hora</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">IP</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Evento</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Origen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pageEvents.map((ev, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(ev.timestamp).toLocaleString("es-CO")}
                    </td>
                    <td className="px-4 py-3 font-mono text-white text-xs">{ev.ip}</td>
                    <td className="px-4 py-3">
                      {ev.event === 'blocked' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25">
                          <XCircle className="w-3 h-3" />
                          Bloqueada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/25">
                          <CheckCircle2 className="w-3 h-3" />
                          Desbloqueada
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ev.origin === 'manual' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/15 text-violet-300 border border-violet-500/25">
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-muted-foreground border border-white/10">
                          Automático
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Anterior
            </button>
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {pageCount}
            </span>
            <button
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors disabled:opacity-40"
            >
              Siguiente
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

type ImagenFile = {
  nombre: string;
  tamano: number;
  modificado: number;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function ImagenesSection() {
  const [usuario, setUsuario] = useState("");
  const [tipo, setTipo] = useState<"imagenes" | "logos">("imagenes");
  const [files, setFiles] = useState<ImagenFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    const uid = usuario.trim();
    if (!uid) { setError("Ingresa un ID de usuario"); return; }
    setLoading(true);
    setError(null);
    setLoaded(false);
    try {
      const res = await fetch(
        `${BASE}/api/admin/hazpost-backend/imagenes/listar?usuario=${encodeURIComponent(uid)}&tipo=${tipo}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json() as { archivos: ImagenFile[] };
      setFiles(data.archivos ?? []);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error cargando archivos");
    } finally {
      setLoading(false);
    }
  }, [usuario, tipo]);

  async function uploadFile(file: File) {
    const uid = usuario.trim();
    if (!uid) { setUploadMsg({ ok: false, text: "Ingresa un ID de usuario primero" }); return; }
    setUploading(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("usuario", uid);
      form.append("tipo", tipo);
      form.append("archivo", file);
      const res = await fetch(`${BASE}/api/admin/hazpost-backend/imagenes/subir`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = await res.json() as { ok?: boolean; nombre?: string; tamano?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setUploadMsg({ ok: true, text: `"${data.nombre}" subida correctamente (${formatBytes(data.tamano ?? 0)})` });
      await loadFiles();
    } catch (e: unknown) {
      setUploadMsg({ ok: false, text: e instanceof Error ? e.message : "Error subiendo archivo" });
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(nombre: string) {
    const uid = usuario.trim();
    setDeletingFile(nombre);
    try {
      const res = await fetch(
        `${BASE}/api/admin/hazpost-backend/imagenes/${encodeURIComponent(uid)}/${tipo}/${encodeURIComponent(nombre)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; throw new Error(d.error ?? `Error ${res.status}`); }
      setFiles(prev => prev.filter(f => f.nombre !== nombre));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error eliminando archivo");
    } finally {
      setDeletingFile(null);
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <SectionCard title="Imágenes de Usuarios" icon={Images}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs text-muted-foreground mb-1.5">ID de usuario</label>
            <input
              type="text"
              value={usuario}
              onChange={e => { setUsuario(e.target.value); setLoaded(false); setFiles([]); setError(null); }}
              placeholder="ej: 42"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#00C2FF]/50"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Tipo</label>
            <div className="flex gap-2">
              {(["imagenes", "logos"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setTipo(t); setLoaded(false); setFiles([]); setError(null); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    tipo === t
                      ? "bg-[#00C2FF]/20 border border-[#00C2FF]/40 text-[#00C2FF]"
                      : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={loadFiles}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Cargar
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loaded && (
          <>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay archivos en <span className="text-white font-medium">{tipo}</span> del usuario <span className="text-white font-medium">{usuario}</span>.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03]">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Nombre</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Tamaño</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Modificado</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {files.map(f => (
                      <tr key={f.nombre} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-white flex items-center gap-2">
                          <FileImage className="w-4 h-4 text-[#00C2FF] shrink-0" />
                          <span className="truncate max-w-xs">{f.nombre}</span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-right whitespace-nowrap">{formatBytes(f.tamano)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-right whitespace-nowrap">
                          {new Date(f.modificado * 1000).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => deleteFile(f.nombre)}
                            disabled={deletingFile === f.nombre}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors disabled:opacity-50"
                          >
                            {deletingFile === f.nombre
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Trash2 className="w-3 h-3" />}
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <div className="border-t border-white/10 pt-5">
          <p className="text-xs text-muted-foreground mb-3 font-medium">Subir imagen</p>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 px-4 transition-colors cursor-pointer ${
              dragOver
                ? "border-[#00C2FF]/60 bg-[#00C2FF]/5"
                : "border-white/20 hover:border-white/40 bg-white/[0.02]"
            } ${uploading ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.webp,.avif,.svg,.bmp"
              onChange={onFileInput}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={uploading}
            />
            {uploading ? (
              <Loader2 className="w-6 h-6 text-[#00C2FF] animate-spin" />
            ) : (
              <Upload className="w-6 h-6 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground text-center">
              {uploading ? "Subiendo..." : "Arrastra una imagen aquí o haz clic para seleccionarla"}
            </p>
            <p className="text-xs text-muted-foreground">JPG, PNG, GIF, WebP, AVIF, SVG, BMP — máx 20 MB</p>
          </div>

          {uploadMsg && (
            <div className={`mt-3 flex items-center gap-2 text-sm ${uploadMsg.ok ? "text-green-400" : "text-red-400"}`}>
              {uploadMsg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
              <span>{uploadMsg.text}</span>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export default function AdminMonitor() {
  const { user } = useAuth();
  return (
    <ProtectedRoute adminOnly adminRedirectTo="/dashboard">
      <div className="min-h-screen bg-background p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/admin/metricas" className="text-muted-foreground hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Monitor HazPost Backend</h1>
            <p className="text-sm text-muted-foreground">Estado en tiempo real, duplicados y aprendizaje colectivo</p>
          </div>
        </div>

        {user?.role !== "admin" ? null : (
          <div className="space-y-6">
            <MonitorSection />
            <BlockedIPsSection />
            <FailedAttemptsSection />
            <BlockHistorySection />
            <DuplicadosSection />
            <AprendizajeSection />
            <ImagenesSection />
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
