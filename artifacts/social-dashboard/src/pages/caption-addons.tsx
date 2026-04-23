import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, MessageSquarePlus, Globe, Tag, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface CaptionAddon {
  id: number;
  userId: number | null;
  businessId: number | null;
  name: string;
  keywords: string;
  text: string;
  position: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

type FormData = {
  name: string;
  keywords: string;
  text: string;
  position: "before" | "after";
  active: boolean;
};

const emptyForm = (): FormData => ({
  name: "",
  keywords: "",
  text: "",
  position: "after",
  active: true,
});

export default function CaptionAddons() {
  const { toast } = useToast();
  const [addons, setAddons] = useState<CaptionAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState<CaptionAddon | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());

  const fetchAddons = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BASE}/api/caption-addons`, { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar");
      const data = await res.json();
      setAddons(Array.isArray(data) ? data : []);
    } catch {
      toast({ title: "Error", description: "No se pudieron cargar los textos adicionales.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchAddons(); }, [fetchAddons]);

  const openModal = (addon: CaptionAddon | null = null) => {
    setEditingAddon(addon);
    setForm(addon ? {
      name: addon.name,
      keywords: addon.keywords,
      text: addon.text,
      position: addon.position === "before" ? "before" : "after",
      active: addon.active,
    } : emptyForm());
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "El nombre es requerido", variant: "destructive" }); return; }
    if (!form.text.trim()) { toast({ title: "El texto es requerido", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const url = editingAddon
        ? `${BASE}/api/caption-addons/${editingAddon.id}`
        : `${BASE}/api/caption-addons`;
      const method = editingAddon ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Error al guardar");
      toast({ title: editingAddon ? "Texto actualizado" : "Texto creado", description: "Cambios guardados exitosamente." });
      setIsModalOpen(false);
      fetchAddons();
    } catch {
      toast({ title: "Error", description: "No se pudo guardar el texto adicional.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (addon: CaptionAddon) => {
    try {
      await fetch(`${BASE}/api/caption-addons/${addon.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !addon.active }),
      });
      fetchAddons();
    } catch {
      toast({ title: "Error al actualizar estado", variant: "destructive" });
    }
  };

  const handleDelete = async (addon: CaptionAddon) => {
    if (!window.confirm(`¿Eliminar "${addon.name}"?`)) return;
    setDeleting(addon.id);
    try {
      await fetch(`${BASE}/api/caption-addons/${addon.id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Texto eliminado" });
      fetchAddons();
    } catch {
      toast({ title: "Error al eliminar", variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const isUniversal = (addon: CaptionAddon) => !addon.keywords.trim();

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquarePlus className="w-6 h-6 text-primary" />
            Textos Adicionales
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Textos que se agregan automáticamente al generar posts según el tema.
          </p>
        </div>
        <Button onClick={() => openModal()} className="gap-2">
          <Plus className="w-4 h-4" /> Agregar
        </Button>
      </div>

      {/* Info card */}
      <Card className="mb-6 border-blue-500/20 bg-blue-500/5">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm text-blue-300 leading-relaxed">
            <span className="font-semibold">¿Cómo funciona?</span> Define textos fijos que acompañarán tus posts automáticamente.
            Puedes usar <span className="font-semibold">palabras clave</span> para que solo apliquen a ciertos temas,
            o dejarlas <span className="font-semibold">vacías</span> para que apliquen a <span className="font-semibold">todos los posts</span> (texto universal).
            La IA generará contenido complementario al texto fijo, sin repetirlo.
          </p>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : addons.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquarePlus className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No tienes textos adicionales configurados aún.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => openModal()}>
            <Plus className="w-4 h-4 mr-1" /> Crear el primero
          </Button>
        </div>
      ) : (
        <AnimatePresence>
          <div className="space-y-3">
            {addons.map(addon => (
              <motion.div
                key={addon.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className={`transition-all ${!addon.active ? "opacity-50" : ""}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm">{addon.name}</span>
                          {isUniversal(addon) ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/50 text-green-400 gap-1">
                              <Globe className="w-2.5 h-2.5" /> Universal
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/50 text-blue-400 gap-1">
                              <Tag className="w-2.5 h-2.5" /> {addon.keywords}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                            {addon.position === "before" ? "Antes del texto IA" : "Después del texto IA"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{addon.text}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Switch
                          checked={addon.active}
                          onCheckedChange={() => handleToggleActive(addon)}
                          className="scale-75"
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openModal(addon)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(addon)}
                          disabled={deleting === addon.id}
                        >
                          {deleting === addon.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      )}

      {/* Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editingAddon ? "Editar texto adicional" : "Nuevo texto adicional"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <div>
              <Label htmlFor="name">Nombre <span className="text-destructive">*</span></Label>
              <Input
                id="name"
                placeholder="Ej: Contacto Carros Eléctricos"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="keywords">Palabras clave</Label>
              <Input
                id="keywords"
                placeholder="Ej: carro, eléctrico, ev, tesla — vacío = aplica a TODOS"
                value={form.keywords}
                onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))}
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Separadas por coma. Si alguna aparece en el tema del post, este texto se activa.
                <span className="text-green-400 font-medium"> Deja vacío para texto universal.</span>
              </p>
            </div>
            <div>
              <Label htmlFor="text">Texto adicional <span className="text-destructive">*</span></Label>
              <Textarea
                id="text"
                placeholder="Ej: 📞 Contáctanos al 300-123-4567 para una cotización gratis."
                value={form.text}
                onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                className="mt-1 min-h-[90px] max-h-[220px] resize-y"
              />
            </div>
            <div>
              <Label>Posición</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  variant={form.position === "before" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm(f => ({ ...f, position: "before" }))}
                  className="flex-1 text-xs"
                >
                  Antes del texto IA
                </Button>
                <Button
                  type="button"
                  variant={form.position === "after" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setForm(f => ({ ...f, position: "after" }))}
                  className="flex-1 text-xs"
                >
                  Después del texto IA
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="active"
                checked={form.active}
                onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
              />
              <Label htmlFor="active" className="cursor-pointer">Activo</Label>
            </div>
            {/* Preview */}
            {form.text.trim() && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wide mb-2">Vista previa del caption final</p>
                <p className="text-xs text-foreground/70 whitespace-pre-wrap leading-relaxed max-h-[180px] overflow-y-auto">
                  {form.position === "before"
                    ? `${form.text.trim()}\n\n[...texto generado por la IA...]`
                    : `[...texto generado por la IA...]\n\n${form.text.trim()}`
                  }
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="shrink-0 pt-2 border-t border-border/30">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingAddon ? "Guardar cambios" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
