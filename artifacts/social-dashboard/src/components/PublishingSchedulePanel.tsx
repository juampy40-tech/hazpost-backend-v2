import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, RotateCcw, Save, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const PLATFORMS = ["instagram", "tiktok"] as const;
const CONTENT_TYPES = ["reel", "image", "carousel", "story"] as const;
type Platform = typeof PLATFORMS[number];
type CT = typeof CONTENT_TYPES[number];

const CT_LABELS: Record<CT, string> = {
  reel:     "🎬 Reels",
  image:    "🖼️ Fotos",
  carousel: "📊 Carruseles",
  story:    "⚡ Stories",
};

const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok:    "TikTok",
};

const PLATFORM_COLOR: Record<Platform, string> = {
  instagram: "from-purple-500/20 to-pink-500/20 border-purple-500/30",
  tiktok:    "from-slate-700/40 to-slate-600/30 border-slate-500/30",
};

type Schedule = Record<Platform, Record<CT, { days: number[]; hours: number[] }>>;

function cloneSchedule(s: Schedule): Schedule {
  return JSON.parse(JSON.stringify(s));
}

export function PublishingSchedulePanel() {
  const { toast } = useToast();
  const [schedule, setSchedule]               = useState<Schedule | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [saving, setSaving]                   = useState(false);
  const [applying, setApplying]               = useState(false);
  const [dirty, setDirty]                     = useState(false);
  const [activePlatform, setActivePlatform]   = useState<Platform>("instagram");
  // true after a successful save — shows the "also apply to existing?" offer
  const [savedRecently, setSavedRecently]     = useState(false);
  // true when user has clicked the "apply" button and we're waiting for confirm
  const [confirmApply, setConfirmApply]       = useState(false);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/publishing-schedule`, { credentials: "include" });
      const data = await res.json();
      setSchedule(data.schedule as Schedule);
      setDirty(false);
    } catch {
      toast({ title: "Error cargando plan", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const toggleDay = (platform: Platform, ct: CT, day: number) => {
    if (!schedule) return;
    const next = cloneSchedule(schedule);
    const days = next[platform][ct].days;
    const idx  = days.indexOf(day);
    if (idx >= 0) days.splice(idx, 1);
    else days.push(day);
    days.sort((a, b) => a - b);
    setSchedule(next);
    setDirty(true);
    setSavedRecently(false);
  };

  const toggleHour = (platform: Platform, ct: CT, hour: number) => {
    if (!schedule) return;
    const next  = cloneSchedule(schedule);
    const hours = next[platform][ct].hours;
    const idx   = hours.indexOf(hour);
    if (idx >= 0) hours.splice(idx, 1);
    else hours.push(hour);
    hours.sort((a, b) => a - b);
    setSchedule(next);
    setDirty(true);
    setSavedRecently(false);
  };

  const save = async () => {
    if (!schedule) return;
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/publishing-schedule/bulk`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ schedule }),
      });
      if (!res.ok) throw new Error();
      setDirty(false);
      setSavedRecently(true);
      setConfirmApply(false);
      toast({ title: "✅ Plan guardado", description: "Las próximas generaciones usarán este plan." });
    } catch {
      toast({ title: "Error guardando plan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const applyToExisting = async () => {
    setApplying(true);
    setConfirmApply(false);
    try {
      const res = await fetch(`${BASE}/api/publishing-schedule/apply-to-existing`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      setSavedRecently(false);
      toast({
        title: `✅ ${data.updated} publicaciones actualizadas`,
        description: "Los horarios de las publicaciones aprobadas/programadas fueron ajustados al nuevo plan.",
      });
    } catch {
      toast({ title: "Error actualizando publicaciones", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const resetToDefaults = async () => {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/publishing-schedule`, { method: "DELETE", credentials: "include" });
      await fetchSchedule();
      setSavedRecently(false);
      toast({ title: "Plan restablecido", description: "Ahora se usan los horarios por defecto." });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/60 border-slate-700">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
        </CardContent>
      </Card>
    );
  }

  if (!schedule) return null;

  return (
    <Card className="bg-slate-800/60 border-slate-700">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <Calendar className="w-5 h-5 text-blue-400" />
              Plan de Publicación
            </CardTitle>
            <CardDescription className="text-slate-400 mt-1">
              Define en qué días y horas (Bogotá) se programa cada tipo de contenido.
              El plan nuevo aplica solo a futuras generaciones — las publicaciones ya aprobadas se respetan.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={resetToDefaults} disabled={saving || applying} className="text-slate-400 hover:text-white">
              <RotateCcw className="w-4 h-4 mr-1" /> Restablecer
            </Button>
            <Button size="sm" onClick={save} disabled={saving || applying || !dirty} className="bg-blue-600 hover:bg-blue-500">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
              Guardar
            </Button>
          </div>
        </div>

        {/* Platform tabs */}
        <div className="flex gap-2 mt-4">
          {PLATFORMS.map(p => (
            <button
              key={p}
              onClick={() => setActivePlatform(p)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                activePlatform === p
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-400 hover:text-white"
              }`}
            >
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {CONTENT_TYPES.map(ct => {
          const entry = schedule[activePlatform]?.[ct];
          if (!entry) return null;
          return (
            <div key={ct} className={`rounded-xl border bg-gradient-to-r ${PLATFORM_COLOR[activePlatform]} p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="font-semibold text-white text-sm">{CT_LABELS[ct]}</span>
                <Badge variant="outline" className="text-xs text-slate-400 border-slate-600">
                  {entry.days.length} días · {entry.hours.length} horas
                </Badge>
              </div>

              {/* Day toggles */}
              <div className="mb-3">
                <p className="text-xs text-slate-500 mb-2">Días de publicación</p>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map((label, idx) => (
                    <button
                      key={idx}
                      onClick={() => toggleDay(activePlatform, ct, idx)}
                      className={`w-9 h-9 rounded-lg text-xs font-medium transition-all ${
                        entry.days.includes(idx)
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40"
                          : "bg-slate-700/60 text-slate-400 hover:bg-slate-600"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hour toggles */}
              <div>
                <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Horas (hora Bogotá)
                </p>
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({ length: 24 }, (_, h) => (
                    <button
                      key={h}
                      onClick={() => toggleHour(activePlatform, ct, h)}
                      className={`w-9 h-8 rounded text-xs font-mono transition-all ${
                        entry.hours.includes(h)
                          ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40"
                          : "bg-slate-700/40 text-slate-500 hover:bg-slate-600 hover:text-slate-300"
                      }`}
                    >
                      {String(h).padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {/* Unsaved changes warning */}
        {dirty && (
          <p className="text-xs text-amber-400 text-center">
            ⚠️ Tienes cambios sin guardar. Presiona <strong>Guardar</strong> para aplicarlos.
          </p>
        )}

        {/* Post-save offer: apply to already-scheduled posts */}
        {savedRecently && !dirty && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-300">Plan guardado ✓</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Las publicaciones ya aprobadas y programadas <strong>no fueron modificadas</strong>.
                  El plan nuevo aplica solo a las que se generen de aquí en adelante.
                </p>
              </div>
            </div>

            {!confirmApply ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmApply(true)}
                className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
              >
                También actualizar publicaciones ya programadas…
              </Button>
            ) : (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2">
                <p className="text-xs text-red-300">
                  ⚠️ <strong>¿Estás seguro?</strong> Esto cambiará la hora de publicación de todos los posts
                  aprobados y programados que aún no se han publicado. Los días no cambian — solo las horas.
                  Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={applyToExisting}
                    disabled={applying}
                    className="bg-red-600 hover:bg-red-500 text-white"
                  >
                    {applying ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                    Sí, actualizar publicaciones programadas
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmApply(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
