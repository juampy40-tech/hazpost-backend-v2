import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useGetNiches, useCreateNiche, useUpdateNiche, useDeleteNiche, type Niche } from "@workspace/api-client-react";
import { getGetNichesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Edit2, Trash2, Tag, Leaf, Sparkles, Loader2, X, Check, TrendingUp, Search, MessageSquarePlus, BarChart2, CheckCircle2, MinusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveBusiness } from "@/contexts/ActiveBusinessContext";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface NicheSuggestion {
  name: string;
  description: string;
  keywords: string;
  reason: string;
  category: "gap" | "performance";
}

export default function Niches() {
  const { data: niches, isLoading } = useGetNiches();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { id: activeBusinessId, name: activeBusinessName } = useActiveBusiness();

  const createNiche = useCreateNiche();
  const updateNiche = useUpdateNiche();
  const deleteNiche = useDeleteNiche();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNiche, setEditingNiche] = useState<Niche | null>(null);
  const [formData, setFormData] = useState<{ name: string; description: string; keywords: string; active: boolean; customText: string; customTextPosition: "after" | "before" }>({ name: "", description: "", keywords: "", active: true, customText: "", customTextPosition: "after" });

  const [suggestions, setSuggestions] = useState<NicheSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState<Set<number>>(new Set());
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);
  const [autoSuggestFired, setAutoSuggestFired] = useState(false);

  const handleOpenModal = (niche: Niche | null = null) => {
    if (niche) {
      setEditingNiche(niche);
      setFormData({
        name: niche.name,
        description: niche.description || "",
        keywords: niche.keywords || "",
        active: niche.active,
        customText: niche.customText || "",
        customTextPosition: niche.customTextPosition || "after",
      });
    } else {
      setEditingNiche(null);
      setFormData({ name: "", description: "", keywords: "", active: true, customText: "", customTextPosition: "after" });
    }
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.name) {
      toast({ title: "Error", description: "El nombre es obligatorio", variant: "destructive" });
      return;
    }

    const saveData = {
      name: formData.name,
      description: formData.description,
      keywords: formData.keywords,
      active: formData.active,
      customText: formData.customText.trim() || null,
      customTextPosition: formData.customTextPosition,
    };

    if (editingNiche) {
      updateNiche.mutate({ id: editingNiche.id, data: saveData }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetNichesQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Éxito", description: "Nicho actualizado." });
        }
      });
    } else {
      createNiche.mutate({ data: saveData }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetNichesQueryKey() });
          setIsModalOpen(false);
          toast({ title: "Éxito", description: "Nicho creado." });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("¿Estás seguro de que quieres eliminar este nicho?")) {
      deleteNiche.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetNichesQueryKey() });
          toast({ title: "Éxito", description: "Nicho eliminado." });
        }
      });
    }
  };

  const handleToggleActive = (id: number, active: boolean, currentData: Niche) => {
    updateNiche.mutate({ id, data: { ...currentData, active } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetNichesQueryKey() });
      }
    });
  };

  const handleGenerateSuggestions = async () => {
    setLoadingSuggestions(true);
    setSuggestionsVisible(true);
    setSuggestions([]);
    setDismissed(new Set());
    try {
      const body: Record<string, unknown> = {};
      if (activeBusinessId != null) body.businessId = activeBusinessId;
      const res = await fetch(`${BASE}/api/niches/suggest`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { suggestions: NicheSuggestion[] };
      setSuggestions(data.suggestions ?? []);
      if ((data.suggestions ?? []).length === 0) {
        toast({ title: "Sin sugerencias", description: "La IA no encontró nichos nuevos para recomendar en este momento." });
      }
    } catch (err) {
      toast({ title: "Error", description: "No se pudieron generar sugerencias. Intenta de nuevo.", variant: "destructive" });
      setSuggestionsVisible(false);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Auto-suggest when user has 0 niches (first visit).
  // Wait for activeBusinessId to load so the suggestion is scoped to the correct business.
  useEffect(() => {
    if (!isLoading && niches && niches.length === 0 && !autoSuggestFired && activeBusinessId != null) {
      setAutoSuggestFired(true);
      handleGenerateSuggestions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, niches, autoSuggestFired, activeBusinessId]);

  const handleAddSuggestion = (idx: number, suggestion: NicheSuggestion) => {
    setAdding(prev => new Set(prev).add(idx));
    createNiche.mutate(
      { data: { name: suggestion.name, description: suggestion.description, keywords: suggestion.keywords, active: true } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetNichesQueryKey() });
          setDismissed(prev => new Set(prev).add(idx));
          toast({ title: "Nicho agregado", description: `"${suggestion.name}" ya está en tu lista.` });
        },
        onError: () => {
          toast({ title: "Error", description: "No se pudo agregar el nicho.", variant: "destructive" });
        },
        onSettled: () => {
          setAdding(prev => { const s = new Set(prev); s.delete(idx); return s; });
        },
      }
    );
  };

  const handleDismiss = (idx: number) => {
    setDismissed(prev => new Set(prev).add(idx));
  };

  const visibleSuggestions = suggestions.filter((_, i) => !dismissed.has(i));

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground drop-shadow-[0_0_15px_rgba(0,201,83,0.3)] flex items-center gap-3">
            <Tag className="w-8 h-8 text-primary" />
            Nichos de Mercado
          </h1>
          <p className="text-muted-foreground mt-2 font-medium">Administra categorías de contenido y palabras clave para la generación.</p>
          {activeBusinessName && (
            <p className="text-sm text-primary/80 font-medium mt-1 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-primary/60" />
              {activeBusinessName}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            onClick={handleGenerateSuggestions}
            disabled={loadingSuggestions}
            className="bg-gradient-to-r from-[#0077FF]/20 to-[#00C2FF]/20 text-[#00C2FF] border border-[#0077FF]/50 hover:from-[#0077FF]/30 hover:to-[#00C2FF]/30 shadow-[0_0_12px_rgba(0,119,255,0.2)]"
          >
            {loadingSuggestions
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando...</>
              : <><Sparkles className="w-4 h-4 mr-2" /> Sugerir con IA</>
            }
          </Button>
          <Button onClick={() => handleOpenModal()} className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 shadow-[0_0_10px_rgba(0,201,83,0.2)]">
            <Plus className="w-4 h-4 mr-2" /> Agregar Nicho
          </Button>
        </div>
      </div>

      {/* Stats row */}
      {!isLoading && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Total nichos",
              value: niches?.length ?? 0,
              icon: <BarChart2 className="w-4 h-4 text-primary" />,
              color: "text-foreground",
            },
            {
              label: "Activos",
              value: niches?.filter(n => n.active).length ?? 0,
              icon: <CheckCircle2 className="w-4 h-4 text-green-400" />,
              color: "text-green-400",
            },
            {
              label: "Inactivos",
              value: (niches?.length ?? 0) - (niches?.filter(n => n.active).length ?? 0),
              icon: <MinusCircle className="w-4 h-4 text-muted-foreground" />,
              color: "text-muted-foreground",
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="p-2 bg-background/60 rounded-lg border border-border/50">
                {stat.icon}
              </div>
              <div>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {suggestionsVisible && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
          >
            <div className="rounded-2xl border border-[#0077FF]/30 bg-gradient-to-br from-[#0077FF]/5 to-[#00C2FF]/5 p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0077FF] to-[#00C2FF] flex items-center justify-center shadow-[0_0_16px_rgba(0,119,255,0.4)]">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-display font-bold text-foreground">Sugerencias de la IA</h2>
                    <p className="text-xs text-muted-foreground">
                      Basadas en tu cobertura actual y el rendimiento de tus posts
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => { setSuggestionsVisible(false); setSuggestions([]); }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {loadingSuggestions ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="relative w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-2 border-[#0077FF]/20 animate-ping" />
                    <div className="absolute inset-2 rounded-full border-2 border-[#00C2FF]/40 animate-ping [animation-delay:0.3s]" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-[#00C2FF]" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    Analizando tus nichos actuales, rendimiento de posts y el catálogo global…
                  </p>
                </div>
              ) : visibleSuggestions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Todas las sugerencias fueron procesadas.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <AnimatePresence>
                    {suggestions.map((s, i) => {
                      if (dismissed.has(i)) return null;
                      const isGap = s.category === "gap";
                      return (
                        <motion.div
                          key={i}
                          layout
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.88 }}
                          transition={{ duration: 0.2, delay: i * 0.06 }}
                        >
                          <Card className="glass-card flex flex-col h-full border-[#0077FF]/20 hover:border-[#0077FF]/40 transition-colors">
                            <CardHeader className="pb-2">
                              <div className="flex items-start justify-between gap-2">
                                <CardTitle className="text-base font-display text-[#00C2FF] leading-snug">
                                  {s.name}
                                </CardTitle>
                                <Badge
                                  variant="outline"
                                  className={`shrink-0 text-xs border ${
                                    isGap
                                      ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
                                      : "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                                  }`}
                                >
                                  {isGap
                                    ? <><Search className="w-3 h-3 mr-1" />Brecha</>
                                    : <><TrendingUp className="w-3 h-3 mr-1" />Rendimiento</>
                                  }
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="flex-1 space-y-3 pb-2">
                              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                                {s.description}
                              </p>
                              <div className="rounded-lg bg-[#0077FF]/8 border border-[#0077FF]/15 p-2.5">
                                <p className="text-xs text-[#00C2FF]/90 italic">
                                  💡 {s.reason}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {s.keywords.split(",").slice(0, 4).map((kw, ki) => (
                                  <span
                                    key={ki}
                                    className="text-xs px-2 py-0.5 rounded bg-[#0077FF]/10 text-[#00C2FF]/80 border border-[#0077FF]/20"
                                  >
                                    {kw.trim()}
                                  </span>
                                ))}
                              </div>
                            </CardContent>
                            <CardFooter className="pt-2 border-t border-border/30 mt-auto flex justify-end gap-2 bg-black/20 rounded-b-xl">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs"
                                onClick={() => handleDismiss(i)}
                              >
                                <X className="w-3 h-3 mr-1" /> Descartar
                              </Button>
                              <Button
                                size="sm"
                                disabled={adding.has(i)}
                                onClick={() => handleAddSuggestion(i, s)}
                                className="bg-[#0077FF]/20 text-[#00C2FF] border border-[#0077FF]/40 hover:bg-[#0077FF]/30 text-xs shadow-[0_0_8px_rgba(0,119,255,0.2)]"
                              >
                                {adding.has(i)
                                  ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  : <Check className="w-3 h-3 mr-1" />
                                }
                                Agregar
                              </Button>
                            </CardFooter>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-48 rounded-xl bg-card border border-border/50 animate-pulse relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {niches?.map((niche) => (
              <motion.div
                key={niche.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <Card className={`glass-card h-full flex flex-col ${!niche.active ? 'opacity-60 grayscale-[50%]' : ''}`}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-xl font-display text-primary">{niche.name}</CardTitle>
                      <Switch
                        checked={niche.active}
                        onCheckedChange={(c) => handleToggleActive(niche.id, c, niche)}
                        className="data-[state=checked]:bg-primary"
                      />
                    </div>
                    {niche.customText && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <MessageSquarePlus className="w-3 h-3 text-secondary/70" />
                        <span className="text-xs text-secondary/70">Texto adicional configurado</span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 pb-2">
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{niche.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {niche.keywords.split(',').slice(0, 3).map((kw, i) => (
                        <span key={i} className="text-xs px-2 py-1 rounded bg-secondary/10 text-secondary border border-secondary/20">
                          {kw.trim()}
                        </span>
                      ))}
                      {niche.keywords.split(',').length > 3 && (
                        <span className="text-xs px-2 py-1 rounded bg-white/5 text-muted-foreground">+{niche.keywords.split(',').length - 3}</span>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 border-t border-border/30 mt-auto flex justify-end gap-2 bg-black/20 rounded-b-xl">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(niche)} className="text-muted-foreground hover:text-primary hover:bg-primary/10">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(niche.id)} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          {niches?.length === 0 && (
            <div className="col-span-full py-16 flex flex-col items-center justify-center text-center">
              {loadingSuggestions ? (
                <>
                  <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-4" />
                  <h3 className="text-xl font-display font-bold text-foreground">La IA está analizando tu marca</h3>
                  <p className="text-muted-foreground mt-2 max-w-md">Generando nichos de mercado personalizados para ti. Solo toma unos segundos...</p>
                </>
              ) : (
                <>
                  <Leaf className="w-16 h-16 text-primary/30 mb-4" />
                  <h3 className="text-xl font-display font-bold text-foreground">Sin nichos aún</h3>
                  <p className="text-muted-foreground mt-2 max-w-md">Los nichos guían a la IA para crear contenido relevante. Usa el botón "Sugerir con IA" o crea uno manualmente.</p>
                  <Button onClick={() => handleOpenModal()} className="mt-6 bg-primary text-primary-foreground">
                    <Plus className="w-4 h-4 mr-2" /> Agregar Primer Nicho
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px] glass-card border-primary/30 bg-background/95">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-primary">{editingNiche ? 'Editar Nicho' : 'Nuevo Nicho'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="bg-black/50 border-border/50 focus-visible:ring-primary" placeholder="Ej. Paneles Solares Residenciales" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea id="description" value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} className="bg-black/50 border-border/50 focus-visible:ring-primary" placeholder="Descripción detallada para guiar la generación de IA..." />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="keywords">Palabras clave (separadas por coma)</Label>
              <Input id="keywords" value={formData.keywords} onChange={(e) => setFormData({...formData, keywords: e.target.value})} className="bg-black/50 border-border/50 focus-visible:ring-primary" placeholder="solar, energia, ahorro..." />
            </div>
            <div className="flex items-center space-x-2 mt-2">
              <Switch id="active" checked={formData.active} onCheckedChange={(c) => setFormData({...formData, active: c})} className="data-[state=checked]:bg-primary" />
              <Label htmlFor="active">Activo (disponible para generación)</Label>
            </div>

            {/* Custom text section */}
            <div className="border-t border-border/30 pt-4 mt-2 space-y-3">
              <div>
                <Label htmlFor="customText" className="flex items-center gap-1.5 mb-1.5">
                  <MessageSquarePlus className="w-3.5 h-3.5 text-secondary" />
                  Texto adicional (opcional)
                </Label>
                <Textarea
                  id="customText"
                  value={formData.customText}
                  onChange={(e) => setFormData({...formData, customText: e.target.value})}
                  className="bg-black/50 border-border/50 focus-visible:ring-primary min-h-[80px] text-sm"
                  placeholder="Ej: ¡Ahorra hasta un 70% en tu factura de luz!"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Este texto se añadirá automáticamente a todas las publicaciones de este tema.
                </p>
              </div>
              {formData.customText.trim() && (
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Posición del texto adicional</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, customTextPosition: "before"})}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        formData.customTextPosition === "before"
                          ? "border-secondary bg-secondary/20 text-secondary"
                          : "border-border/40 text-muted-foreground hover:border-secondary/40"
                      }`}
                    >
                      Antes del texto IA
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, customTextPosition: "after"})}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        formData.customTextPosition === "after"
                          ? "border-secondary bg-secondary/20 text-secondary"
                          : "border-border/40 text-muted-foreground hover:border-secondary/40"
                      }`}
                    >
                      Después del texto IA
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createNiche.isPending || updateNiche.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(0,201,83,0.4)]">
              {(createNiche.isPending || updateNiche.isPending) ? 'Guardando...' : 'Guardar Nicho'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
