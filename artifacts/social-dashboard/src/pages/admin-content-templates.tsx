import { useState, useEffect, useRef } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Link } from "wouter";
import {
  ArrowLeft, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Save, X, FileText, Loader2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";

interface ContentTemplate {
  id: number;
  industrySlug: string;
  industryName: string;
  title: string;
  description: string;
  postType: string;
  tone: string;
  suggestedTopic: string;
  hashtags: string;
  isActive: boolean;
  sortOrder: number;
}

interface Industry {
  slug: string;
  name: string;
}

type FormData = Omit<ContentTemplate, "id">;

const POST_TYPE_LABELS: Record<string, string> = {
  image: "Imagen", reel: "Reel", carousel: "Carrusel", story: "Historia",
};

const TONE_OPTIONS = [
  "cercano", "profesional", "educativo", "motivacional", "informativo",
  "inspiracional", "divertido", "formal", "empático",
];

const EMPTY_FORM: FormData = {
  industrySlug: "", industryName: "", title: "", description: "",
  postType: "image", tone: "cercano", suggestedTopic: "", hashtags: "",
  isActive: true, sortOrder: 0,
};

export default function AdminContentTemplates() {
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterIndustry, setFilterIndustry] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/admin/content-templates`, { credentials: "include" });
      const d = await r.json();
      setTemplates(d.templates ?? []);
      setIndustries(d.industries ?? []);
    } catch {
      setError("Error al cargar plantillas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setModalOpen(true);
  }

  function openEdit(t: ContentTemplate) {
    setForm({
      industrySlug: t.industrySlug, industryName: t.industryName, title: t.title,
      description: t.description, postType: t.postType, tone: t.tone,
      suggestedTopic: t.suggestedTopic, hashtags: t.hashtags,
      isActive: t.isActive, sortOrder: t.sortOrder,
    });
    setEditingId(t.id);
    setModalOpen(true);
  }

  function handleIndustryChange(slug: string) {
    const ind = industries.find(i => i.slug === slug);
    setForm(prev => ({ ...prev, industrySlug: slug, industryName: ind?.name ?? "" }));
  }

  async function handleSave() {
    if (!form.industrySlug || !form.title.trim()) return;
    setSaving(true);
    try {
      const url = editingId
        ? `${BASE}/api/admin/content-templates/${editingId}`
        : `${BASE}/api/admin/content-templates`;
      const method = editingId ? "PUT" : "POST";
      await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setModalOpen(false);
      await load();
    } catch {
      setError("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(t: ContentTemplate) {
    await fetch(`${BASE}/api/admin/content-templates/${t.id}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    await load();
  }

  async function handleDelete(id: number) {
    await fetch(`${BASE}/api/admin/content-templates/${id}`, {
      method: "DELETE", credentials: "include",
    });
    setDeleteConfirm(null);
    await load();
  }

  const filtered = templates.filter(t =>
    (!filterIndustry || t.industrySlug === filterIndustry) &&
    (!filterType || t.postType === filterType)
  );

  const grouped = filtered.reduce<Record<string, ContentTemplate[]>>((acc, t) => {
    const key = t.industryName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <ProtectedRoute adminOnly adminRedirectTo="/dashboard">
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-5xl mx-auto px-4 py-8">

          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link href="/admin">
              <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />
                Admin
              </button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <FileText className="w-6 h-6 text-primary" />
                Plantillas de Contenido
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Plantillas predefinidas que los usuarios pueden aplicar al generar contenido
              </p>
            </div>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-primary/20 border border-primary/40 text-primary rounded-lg text-sm font-medium hover:bg-primary/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva plantilla
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-3 mb-6">
            <select
              value={filterIndustry}
              onChange={e => setFilterIndustry(e.target.value)}
              className="bg-card border border-border/50 text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50"
            >
              <option value="">Todas las industrias</option>
              {industries.map(i => <option key={i.slug} value={i.slug}>{i.name}</option>)}
            </select>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-card border border-border/50 text-foreground text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-primary/50"
            >
              <option value="">Todos los tipos</option>
              {Object.entries(POST_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <span className="ml-auto text-xs text-muted-foreground self-center">
              {filtered.length} plantillas
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              No hay plantillas. Crea la primera.
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(grouped).map(([industry, items]) => (
                <div key={industry}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {industry} <span className="font-normal normal-case text-xs">({items.length})</span>
                  </h2>
                  <div className="space-y-2">
                    {items.map(t => (
                      <div
                        key={t.id}
                        className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
                          t.isActive
                            ? "bg-card/50 border-border/50"
                            : "bg-card/20 border-border/20 opacity-60"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-foreground">{t.title}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${
                              t.postType === "reel" ? "bg-secondary/20 text-secondary border-secondary/30" :
                              t.postType === "carousel" ? "bg-purple-500/20 text-purple-400 border-purple-500/30" :
                              t.postType === "story" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                              "bg-primary/20 text-primary border-primary/30"
                            }`}>
                              {POST_TYPE_LABELS[t.postType] ?? t.postType}
                            </span>
                            {t.tone && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-border/30">
                                {t.tone}
                              </span>
                            )}
                          </div>
                          {t.description && (
                            <p className="text-xs text-muted-foreground mb-1">{t.description}</p>
                          )}
                          {t.suggestedTopic && (
                            <p className="text-xs text-foreground/60 italic truncate">
                              "{t.suggestedTopic}"
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleToggle(t)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title={t.isActive ? "Desactivar" : "Activar"}
                          >
                            {t.isActive ? <ToggleRight className="w-5 h-5 text-primary" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                          <button
                            onClick={() => openEdit(t)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(t.id)}
                            className="text-muted-foreground hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border/60 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border/40">
              <h2 className="font-bold text-foreground">
                {editingId ? "Editar plantilla" : "Nueva plantilla"}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Industria *</label>
                  <select
                    value={form.industrySlug}
                    onChange={e => handleIndustryChange(e.target.value)}
                    className="w-full bg-black/30 border border-border/50 text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50"
                  >
                    <option value="">Selecciona una industria</option>
                    {industries.map(i => <option key={i.slug} value={i.slug}>{i.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Título *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Ej: Plato del día"
                    className="w-full bg-black/30 border border-border/50 text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Descripción</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Breve descripción para el admin"
                    className="w-full bg-black/30 border border-border/50 text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Tipo de post</label>
                  <select
                    value={form.postType}
                    onChange={e => setForm(p => ({ ...p, postType: e.target.value }))}
                    className="w-full bg-black/30 border border-border/50 text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50"
                  >
                    {Object.entries(POST_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Tono</label>
                  <select
                    value={form.tone}
                    onChange={e => setForm(p => ({ ...p, tone: e.target.value }))}
                    className="w-full bg-black/30 border border-border/50 text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50"
                  >
                    <option value="">Sin tono</option>
                    {TONE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Tema sugerido (se pre-llena en el generador)</label>
                  <textarea
                    value={form.suggestedTopic}
                    onChange={e => setForm(p => ({ ...p, suggestedTopic: e.target.value }))}
                    rows={3}
                    placeholder="Texto que se copiará al campo 'Tema o Briefing' del generador"
                    className="w-full bg-black/30 border border-border/50 text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 resize-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Hashtags sugeridos</label>
                  <input
                    type="text"
                    value={form.hashtags}
                    onChange={e => setForm(p => ({ ...p, hashtags: e.target.value }))}
                    placeholder="#hashtag1 #hashtag2"
                    className="w-full bg-black/30 border border-border/50 text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Orden</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={e => setForm(p => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-black/30 border border-border/50 text-foreground text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex items-center gap-2 self-end pb-2">
                  <input
                    type="checkbox"
                    id="tmpl-active"
                    checked={form.isActive}
                    onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                    className="w-4 h-4 accent-primary"
                  />
                  <label htmlFor="tmpl-active" className="text-sm text-foreground">Activa</label>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-border/40">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 px-4 py-2 border border-border/50 text-muted-foreground rounded-lg text-sm hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.industrySlug || !form.title.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary/20 border border-primary/40 text-primary rounded-lg text-sm font-medium hover:bg-primary/30 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-red-500/30 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-foreground mb-2">¿Eliminar plantilla?</h3>
            <p className="text-sm text-muted-foreground mb-5">Esta acción no se puede deshacer.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-border/50 text-muted-foreground rounded-lg text-sm hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-500/20 border border-red-500/40 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
