import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useGetSocialAccounts, useTestSocialAccount, useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Settings as SettingsIcon, Instagram, PlaySquare, CheckCircle2, XCircle, AlertCircle, Loader2, Save, ExternalLink, Key, ChevronDown, ChevronUp, Globe, Bell, Send, Search, BookOpen, Facebook, Sparkles, Pencil, ShieldCheck, Trash2, AlertTriangle, Layers, RefreshCw, Upload, PowerOff, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { AIPostingSuggestionsPanel } from "@/components/AIPostingSuggestionsPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveBusiness } from "@/contexts/ActiveBusinessContext";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

interface BrandProfile {
  companyName?: string;
  industry?: string;
  country?: string;
  website?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  businessDescription?: string;
  brandFont?: string;
  brandFontUrl?: string;
  audienceDescription?: string;
  brandTone?: string;
  referenceImages?: string;
  defaultLocation?: string | null;
  onboardingStep?: number;
  onboardingCompleted?: boolean | string;
}

export default function Settings() {
  const { user, logout } = useAuth();
  const { id: globalBusinessId, name: activeBusinessName, total: totalBusinesses, list: businessList, switchBusiness } = useActiveBusiness();
  const [, navigate] = useLocation();
  const { data: accounts, isLoading: accountsLoading, refetch: refetchAccounts } = useGetSocialAccounts();
  const { data: settings, isLoading: settingsLoading, refetch: refetchSettings } = useGetSettings();
  const [showBrandWizard, setShowBrandWizard] = useState(false);
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [defaultLocationInput, setDefaultLocationInput] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [countryInput, setCountryInput] = useState("");
  const [savingCountry, setSavingCountry] = useState(false);
  const [userTzInput, setUserTzInput] = useState("");
  const [savingUserTz, setSavingUserTz] = useState(false);
  const [bizTzInput, setBizTzInput] = useState("");
  const [savingBizTz, setSavingBizTz] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteMethod, setDeleteMethod] = useState<"totp" | "password" | "email" | null>(null);
  const [deleteMethodLoading, setDeleteMethodLoading] = useState(false);
  const [deleteConfirmValue, setDeleteConfirmValue] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState("");
  const [codeResendCooldown, setCodeResendCooldown] = useState(0);
  const resendTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elements library state
  const [activeBusinessId, setActiveBusinessId] = useState<number | null>(null);
  const [elBusinessList, setElBusinessList] = useState<{ id: number; name: string }[]>([]);
  const [bizElements, setBizElements] = useState<{ id: number; name: string; thumbUrl?: string | null; analysisStatus?: string }[]>([]);
  const [bizElementsLoading, setBizElementsLoading] = useState(false);
  const [elDeletingId, setElDeletingId] = useState<number | null>(null);
  const [elRenamingId, setElRenamingId] = useState<number | null>(null);
  const [elRenameValue, setElRenameValue] = useState("");
  const [elUploadFile, setElUploadFile] = useState<File | null>(null);
  const [elUploadName, setElUploadName] = useState("");
  const [elUploading, setElUploading] = useState(false);
  const [showElUploadWidget, setShowElUploadWidget] = useState(false);
  const elUploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${BASE}/api/brand-profile`, { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setBrandProfile(d.profile);
        setDefaultLocationInput(d.profile?.defaultLocation ?? "");
      })
      .catch(() => {});
  }, []);

  // Load country and business timezone from active business when it changes
  useEffect(() => {
    if (!globalBusinessId) return;
    fetch(`${BASE}/api/businesses/${globalBusinessId}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((d: { business?: { country?: string | null; timezone?: string | null } } | null) => {
        setCountryInput(d?.business?.country ?? "");
        setBizTzInput(d?.business?.timezone ?? "");
      })
      .catch(() => {});
  }, [globalBusinessId]);

  // Initialize user timezone from auth context
  useEffect(() => {
    if (user?.timezone) setUserTzInput(user.timezone);
  }, [user?.timezone]);

  async function saveCountry() {
    if (!globalBusinessId) return;
    setSavingCountry(true);
    try {
      const res = await fetch(`${BASE}/api/businesses/${globalBusinessId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: countryInput || null }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: countryInput ? `✅ País guardado: ${countryInput}` : "✅ País eliminado",
          description: countryInput
            ? "Las nuevas imágenes llevarán este país para el filtro de Biblioteca de Fondos."
            : "Negocios sin país configurado no ven fondos de otros negocios.",
        });
      } else {
        throw new Error(data.error || "Error desconocido");
      }
    } catch (e) {
      toast({ title: "Error al guardar", description: String(e), variant: "destructive" });
    } finally {
      setSavingCountry(false);
    }
  }

  async function saveUserTimezone() {
    setSavingUserTz(true);
    try {
      const res = await fetch(`${BASE}/api/user/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: userTzInput || null }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: userTzInput ? `✅ Zona horaria guardada` : "✅ Zona horaria eliminada",
          description: userTzInput
            ? `El calendario y la cola de aprobación usarán ${userTzInput}. Recarga la página para ver el cambio.`
            : "Se usará la zona horaria de tu país de registro.",
        });
      } else {
        throw new Error(data.error || "Error desconocido");
      }
    } catch (e) {
      toast({ title: "Error al guardar", description: String(e), variant: "destructive" });
    } finally {
      setSavingUserTz(false);
    }
  }

  async function saveBizTimezone() {
    if (!globalBusinessId) return;
    setSavingBizTz(true);
    try {
      const res = await fetch(`${BASE}/api/businesses/${globalBusinessId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: bizTzInput || null }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: bizTzInput ? `✅ Zona horaria del negocio guardada` : "✅ Zona horaria del negocio eliminada",
          description: bizTzInput
            ? `El negocio está configurado en ${bizTzInput}.`
            : "El negocio usará la zona horaria del usuario.",
        });
      } else {
        throw new Error(data.error || "Error desconocido");
      }
    } catch (e) {
      toast({ title: "Error al guardar", description: String(e), variant: "destructive" });
    } finally {
      setSavingBizTz(false);
    }
  }

  async function saveDefaultLocation() {
    setSavingLocation(true);
    try {
      const res = await fetch(`${BASE}/api/brand-profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultLocation: defaultLocationInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setBrandProfile(prev => prev ? { ...prev, defaultLocation: data.profile?.defaultLocation } : prev);
        toast({
          title: defaultLocationInput.trim() ? `✅ Ubicación guardada: ${defaultLocationInput.trim()}` : "✅ Ubicación eliminada",
          description: defaultLocationInput.trim()
            ? "La IA usará esta ubicación automáticamente en nuevas publicaciones."
            : "La IA no agregará ubicación a las publicaciones.",
        });
      } else {
        throw new Error(data.error || "Error desconocido");
      }
    } catch (e) {
      toast({ title: "Error al guardar", description: String(e), variant: "destructive" });
    } finally {
      setSavingLocation(false);
    }
  }

  const testAccount = useTestSocialAccount();
  const updateSettings = useUpdateSettings();
  const [disconnectingPlatform, setDisconnectingPlatform] = useState<string | null>(null);

  const { toast } = useToast();

  // Initialize local element-section selector from the global active business
  useEffect(() => {
    if (globalBusinessId != null && activeBusinessId == null) {
      setActiveBusinessId(globalBusinessId);
    }
  }, [globalBusinessId]);

  // Fetch business list for the elements dropdown (does not set active — that comes from context above)
  useEffect(() => {
    fetch(`${BASE}/api/businesses`, { credentials: "include" })
      .then(r => r.json())
      .then((d: { businesses?: { id: number; name: string }[] }) => {
        setElBusinessList((d.businesses ?? []).map(b => ({ id: b.id, name: b.name })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeBusinessId) fetchBizElements(activeBusinessId);
  }, [activeBusinessId]);

  async function fetchBizElements(businessId: number) {
    setBizElementsLoading(true);
    try {
      const res = await fetch(`${BASE}/api/elements?businessId=${businessId}&limit=20`, { credentials: "include" });
      if (res.ok) {
        const d = await res.json();
        setBizElements(d.elements ?? []);
      }
    } catch {}
    finally { setBizElementsLoading(false); }
  }

  async function handleDeleteElement(elId: number) {
    if (!activeBusinessId) return;
    setElDeletingId(elId);
    try {
      const res = await fetch(`${BASE}/api/elements/${elId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Error eliminando el elemento");
      }
      await fetchBizElements(activeBusinessId);
      toast({ title: "Elemento eliminado" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "No se pudo eliminar.", variant: "destructive" });
    } finally {
      setElDeletingId(null);
    }
  }

  async function handleRenameElement(elId: number, newName: string) {
    const trimmed = newName.trim().slice(0, 100);
    if (!trimmed || !activeBusinessId) return;
    try {
      const res = await fetch(`${BASE}/api/elements/${elId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Error renombrando el elemento");
      }
      setBizElements(prev => prev.map(e => e.id === elId ? { ...e, name: trimmed } : e));
      setElRenamingId(null);
      toast({ title: "Elemento renombrado" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "No se pudo renombrar.", variant: "destructive" });
    }
  }

  async function handleElementUploadSettings() {
    if (!elUploadFile || !elUploadName.trim() || !activeBusinessId) return;
    setElUploading(true);
    try {
      const urlRes = await fetch(`${BASE}/api/elements/upload-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: activeBusinessId }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({})) as { code?: string };
        if (err.code === "element_limit_reached") throw new Error("Límite de 20 elementos alcanzado");
        throw new Error("Error generando URL de subida");
      }
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": elUploadFile.type },
        body: elUploadFile,
      });
      if (!uploadRes.ok) throw new Error("Error subiendo el archivo");
      const createRes = await fetch(`${BASE}/api/elements`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: activeBusinessId, name: elUploadName.trim(), storageKey: objectPath }),
      });
      if (!createRes.ok) {
        const createErr = await createRes.json().catch(() => ({})) as { message?: string };
        throw new Error(createErr.message ?? "Error registrando el elemento");
      }
      await fetchBizElements(activeBusinessId);
      setElUploadFile(null);
      setElUploadName("");
      setShowElUploadWidget(false);
      toast({ title: "Elemento subido", description: "El elemento se está analizando con IA." });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "No se pudo subir el elemento.", variant: "destructive" });
    } finally {
      setElUploading(false);
    }
  }

  // OAuth credential settings
  const [metaAppId, setMetaAppId] = useState("");
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [tiktokClientKey, setTiktokClientKey] = useState("");
  const [tiktokClientSecret, setTiktokClientSecret] = useState("");

  // Automation settings — per business
  const [autoGenBusinessId, setAutoGenBusinessId] = useState<number | null>(null);
  const [autoGenBusinessName, setAutoGenBusinessName] = useState("");
  const [autoGenBusinessList, setAutoGenBusinessList] = useState<{ id: number; name: string }[]>([]);
  const [autoGenEnabled, setAutoGenEnabled] = useState(false);
  const [genFreq, setGenFreq] = useState("15");
  const [savingAutoGen, setSavingAutoGen] = useState(false);
  const [disablingAll, setDisablingAll] = useState(false);

  // Telegram notification settings
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [detectingChatId, setDetectingChatId] = useState(false);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [showTelegramGuide, setShowTelegramGuide] = useState(false);

  // Instagram connection status — persists between tests so user sees current state
  const [igLinkStatus, setIgLinkStatus] = useState<"linked" | "not_linked" | "error" | null>(null);

  // Manual token connection
  const [showManualMeta, setShowManualMeta] = useState(false);
  const [manualMetaToken, setManualMetaToken] = useState("");
  const [manualMetaPageId, setManualMetaPageId] = useState("");
  const [savingManualMeta, setSavingManualMeta] = useState(false);

  // Token exchange (short-lived → long-lived, ~60 days)
  const [showExchangeToken, setShowExchangeToken] = useState(false);
  const [exchangeUserToken, setExchangeUserToken] = useState("");
  const [exchangingToken, setExchangingToken] = useState(false);
  const [autoRenewing, setAutoRenewing] = useState(false);

  // Page selector — shown when user manages multiple FB/IG pages
  interface PageOption { id: string; name: string; igUsername?: string }
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [pageSelectOptions, setPageSelectOptions] = useState<PageOption[]>([]);
  const [pageSelectSource, setPageSelectSource] = useState<"oauth" | "exchange" | null>(null);
  const [pendingOauthSessionId, setPendingOauthSessionId] = useState<string | null>(null);
  const [pendingExchangeToken, setPendingExchangeToken] = useState<string | null>(null);
  const [selectingPage, setSelectingPage] = useState(false);

  // Transfer conflict — when the selected page is already linked to another business
  interface TransferConflict { fromBusinessId: number; fromBusinessName: string; toBusinessId: number; accountId: number }
  const [transferConflict, setTransferConflict] = useState<TransferConflict | null>(null);
  const [pendingTransferPageId, setPendingTransferPageId] = useState<string | null>(null);
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);

  // Load business list and auto-gen settings for the default business on mount
  useEffect(() => {
    fetch(`${BASE}/api/businesses`, { credentials: "include" })
      .then(r => r.json())
      .then((d: { businesses?: { id: number; name: string; isDefault?: boolean }[] }) => {
        const list = (d.businesses ?? []).map(b => ({ id: b.id, name: b.name }));
        setAutoGenBusinessList(list);
        const def = (d.businesses ?? []).find(b => b.isDefault) ?? (d.businesses ?? [])[0];
        if (def) loadAutoGenSettings(def.id);
      })
      .catch(() => {});
  }, []);

  function loadAutoGenSettings(bizId: number) {
    fetch(`${BASE}/api/businesses/${bizId}/auto-gen`, { credentials: "include" })
      .then(r => r.json())
      .then((d: { autoGenerationEnabled?: boolean; generationFrequency?: string; businessName?: string }) => {
        setAutoGenBusinessId(bizId);
        setAutoGenBusinessName(d.businessName ?? "");
        setAutoGenEnabled(d.autoGenerationEnabled === true);
        setGenFreq(d.generationFrequency ?? "15");
      })
      .catch(() => {});
  }

  async function handleDisableAllAutoGen() {
    setDisablingAll(true);
    try {
      const res = await fetch(`${BASE}/api/businesses/auto-gen/disable-all`, {
        method: "PUT",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json() as { disabled: number };
        toast({ title: "Auto-generación desactivada", description: `Se desactivó para ${data.disabled} negocio${data.disabled !== 1 ? "s" : ""}.` });
        if (autoGenBusinessId) loadAutoGenSettings(autoGenBusinessId);
      } else {
        toast({ title: "Error al desactivar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setDisablingAll(false);
    }
  }

  async function handleSaveAutoGenSettings() {
    if (!autoGenBusinessId) return;
    setSavingAutoGen(true);
    try {
      const res = await fetch(`${BASE}/api/businesses/${autoGenBusinessId}/auto-gen`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoGenerationEnabled: autoGenEnabled, generationFrequency: genFreq }),
      });
      if (res.ok) {
        toast({ title: "Configuración guardada", description: `Auto-generación actualizada para ${autoGenBusinessName}.` });
      } else {
        toast({ title: "Error al guardar", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setSavingAutoGen(false);
    }
  }

  const handleAutoRenewMetaToken = async () => {
    setAutoRenewing(true);
    try {
      const res = await fetch(`${BASE}/api/social-accounts/meta/refresh-token`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Renovación ejecutada", description: data.message });
        refetchAccounts();
      } else {
        toast({ title: "Error al renovar", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setAutoRenewing(false);
    }
  };

  const handleExchangeToken = async (pageId?: string) => {
    const token = pageId ? (pendingExchangeToken ?? exchangeUserToken.trim()) : exchangeUserToken.trim();
    if (!token) {
      toast({ title: "Token requerido", description: "Pega tu User Token del API Explorer.", variant: "destructive" });
      return;
    }
    setExchangingToken(true);
    try {
      const body: Record<string, string> = { userToken: token };
      if (pageId) body.pageId = pageId;
      const res = await fetch(`${BASE}/api/social-accounts/meta/exchange-token`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { success: boolean; needsPageSelection?: boolean; pages?: Array<{ id: string; name: string; igUsername?: string }>; userToken?: string; message?: string; error?: string };
      if (data.success) {
        toast({ title: "¡Token renovado!", description: data.message });
        refetchAccounts();
        setExchangeUserToken("");
        setShowExchangeToken(false);
        setShowPageSelector(false);
      } else if (data.needsPageSelection && data.pages) {
        setPendingExchangeToken(data.userToken ?? token);
        setPageSelectOptions(data.pages);
        setPageSelectSource("exchange");
        setShowPageSelector(true);
      } else {
        toast({ title: "Error al canjear", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setExchangingToken(false);
    }
  };

  const handlePageSelect = async (pageId: string, confirmTransfer = false) => {
    setSelectingPage(true);
    try {
      if (pageSelectSource === "oauth" && pendingOauthSessionId) {
        const res = await fetch(`${BASE}/api/auth/meta/select-page`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: pendingOauthSessionId, pageId, confirmTransfer }),
        });
        const data = await res.json() as {
          success?: boolean;
          username?: string;
          error?: string;
          transferConflict?: { fromBusinessId: number; fromBusinessName: string; toBusinessId: number; accountId: number };
        };
        if (data.success) {
          toast({ title: "Instagram Conectado", description: `Vinculado como ${data.username ?? ""}` });
          refetchAccounts();
          setShowPageSelector(false);
          setPendingOauthSessionId(null);
          setTransferConflict(null);
          setPendingTransferPageId(null);
        } else if (res.status === 409 && data.transferConflict) {
          // Show confirmation dialog — don't show error toast, user must confirm
          setTransferConflict(data.transferConflict);
          setPendingTransferPageId(pageId);
        } else {
          toast({ title: "Error al conectar", description: data.error, variant: "destructive" });
        }
      } else if (pageSelectSource === "exchange") {
        await handleExchangeToken(pageId);
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setSelectingPage(false);
    }
  };

  const handleConfirmTransfer = async () => {
    if (!pendingTransferPageId) return;
    setConfirmingTransfer(true);
    try {
      await handlePageSelect(pendingTransferPageId, true);
    } finally {
      setConfirmingTransfer(false);
      setTransferConflict(null);
      setPendingTransferPageId(null);
    }
  };

  const handleSaveManualMetaToken = async () => {
    if (!manualMetaToken.trim() || !manualMetaPageId.trim()) {
      toast({ title: "Campos requeridos", description: "Necesitas el token de acceso y el ID de la página.", variant: "destructive" });
      return;
    }
    setSavingManualMeta(true);
    try {
      const res = await fetch(`${BASE}/api/social-accounts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "instagram",
          username: "@mi_cuenta",
          accessToken: manualMetaToken.trim(),
          pageId: manualMetaPageId.trim(),
        }),
      });
      if (res.ok) {
        toast({ title: "¡Instagram conectado!", description: "Token guardado correctamente. Prueba la conexión para verificar." });
        refetchAccounts();
        setManualMetaToken("");
        setShowManualMeta(false);
      } else {
        toast({ title: "Error", description: "No se pudo guardar el token.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", description: "Revisa tu conexión.", variant: "destructive" });
    } finally {
      setSavingManualMeta(false);
    }
  };

  useEffect(() => {
    if (settings) {
      setMetaAppId(settings.meta_app_id ?? "");
      setMetaAppSecret("");
      setTiktokClientKey(settings.tiktok_client_key ?? "");
      setTiktokClientSecret("");
      // NOTE: genFreq is now per-business and loaded separately via loadAutoGenSettings().
      // Do NOT set genFreq from global settings here — that would overwrite business-specific values.
    }
  }, [settings]);

  // Load per-user Telegram config from the dedicated endpoint
  useEffect(() => {
    fetch(`${BASE}/api/settings/telegram`)
      .then(r => r.json())
      .then((data: { telegram_bot_token: string; telegram_chat_id: string; configured: boolean }) => {
        setTelegramChatId(data.telegram_chat_id ?? "");
        setTelegramConfigured(data.configured ?? false);
      })
      .catch(() => {});
  }, []);

  const handleSaveTelegram = async () => {
    if (!telegramToken && !telegramChatId) {
      toast({ title: "Campos requeridos", description: "Ingresa el Bot Token y el Chat ID.", variant: "destructive" });
      return;
    }
    setSavingTelegram(true);
    try {
      const body: Record<string, string> = {};
      if (telegramToken && telegramToken !== "••••••••") body.telegram_bot_token = telegramToken;
      if (telegramChatId !== undefined) body.telegram_chat_id = telegramChatId;
      const res = await fetch(`${BASE}/api/settings/telegram`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: "¡Telegram guardado!", description: "Bot Token y Chat ID configurados correctamente." });
        setTelegramToken("");
        setTelegramChatId(data.telegram_chat_id ?? "");
        setTelegramConfigured(data.configured ?? false);
      } else {
        toast({ title: "Error", description: "No se pudo guardar la configuración.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setSavingTelegram(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      const res = await fetch(`${BASE}/api/settings/test-telegram`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: telegramToken, chatId: telegramChatId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: "¡Notificación enviada!", description: "Revisa tu Telegram — deberías ver el mensaje de prueba." });
      } else {
        toast({ title: "Error al enviar", description: data.error ?? "Verifica el Token y Chat ID.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleDetectChatId = async () => {
    setDetectingChatId(true);
    try {
      const res = await fetch(`${BASE}/api/settings/detect-telegram-chat-id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: telegramToken }),
      });
      const data = await res.json();
      if (data.chatId) {
        setTelegramChatId(data.chatId);
        toast({ title: "¡Chat ID detectado!", description: `Hola ${data.firstName ?? ""}! ID: ${data.chatId}` });
      } else {
        toast({ title: "No se detectó Chat ID", description: data.error ?? "Envíale /start al bot e intenta de nuevo.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error de red", variant: "destructive" });
    } finally {
      setDetectingChatId(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    const oauthPending = params.get("oauth_pending");

    if (oauthPending) {
      window.history.replaceState({}, "", window.location.pathname);
      fetch(`${BASE}/api/auth/meta/pending-pages/${oauthPending}`, { credentials: "include" })
        .then(r => r.json())
        .then((data: { pages?: Array<{ id: string; name: string; igUsername?: string }>; error?: string }) => {
          if (data.error) {
            toast({ title: "Sesión expirada", description: data.error, variant: "destructive" });
          } else if (data.pages && data.pages.length > 0) {
            setPendingOauthSessionId(oauthPending);
            setPageSelectOptions(data.pages);
            setPageSelectSource("oauth");
            setShowPageSelector(true);
          }
        })
        .catch(() => toast({ title: "Error al cargar páginas", variant: "destructive" }));
    } else if (success === "meta_connected") {
      toast({ title: "Instagram Conectado", description: "Tu cuenta de Meta fue autorizada correctamente." });
      refetchAccounts();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (success === "tiktok_connected") {
      toast({ title: "TikTok Conectado", description: "Tu cuenta de TikTok fue autorizada correctamente." });
      refetchAccounts();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      toast({ title: "Error de autorización", description: decodeURIComponent(error), variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleSaveCredentials = async () => {
    await fetch(`${BASE}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meta_app_id: metaAppId,
        meta_app_secret: metaAppSecret,
        tiktok_client_key: tiktokClientKey,
        tiktok_client_secret: tiktokClientSecret,
      }),
    });
    toast({ title: "Credenciales guardadas", description: "Los App IDs y Secrets han sido actualizados." });
    refetchSettings();
  };

  const handleConnectMeta = () => {
    // VM-4b: use the globally-active business from context (not the Elements-section local state)
    // so the social account is registered under the business the user has selected in the top nav.
    const biz = globalBusinessId ? `?businessId=${globalBusinessId}` : "";
    window.location.href = `${BASE}/api/auth/meta/redirect${biz}`;
  };

  const handleConnectTikTok = () => {
    // VM-4b: same — globalBusinessId from context ensures we link to the correct business.
    const biz = globalBusinessId ? `?businessId=${globalBusinessId}` : "";
    window.location.href = `${BASE}/api/auth/tiktok/redirect${biz}`;
  };

  type TestConnectionResult = {
    connected: boolean;
    instagramLinked?: boolean;
    username: string | null;
    message: string;
  };

  const handleTestConnection = (platform: string) => {
    testAccount.mutate({ platform }, {
      onSuccess: (res: TestConnectionResult) => {
        if (platform === "instagram") {
          if (res.instagramLinked) {
            // instagramLinked=true means either the live test found the IG account OR
            // the DB already has a valid ig_user_id set (manually or via OAuth).
            setIgLinkStatus("linked");
            toast({
              title: "Facebook ✓ · Instagram ✓",
              description: res.username ? `Conectado como ${res.username}` : "Instagram configurado correctamente",
            });
          } else if (res.instagramLinked === false) {
            setIgLinkStatus("not_linked");
            toast({
              title: "Facebook ✓ · Instagram no configurado",
              description: res.message,
              variant: "destructive",
            });
          } else {
            setIgLinkStatus("error");
            toast({ title: "Fallo de conexión", description: res.message, variant: "destructive" });
          }
        } else {
          if (res.connected) {
            toast({ title: "Conectado", description: `Conectado como ${res.username}` });
          } else {
            toast({ title: "Fallo de conexión", description: res.message, variant: "destructive" });
          }
        }
      }
    });
  };

  const handleSaveSettings = () => {
    updateSettings.mutate({ data: { generation_frequency: genFreq, timezone: "UTC", auto_generation: "true" } }, {
      onSuccess: () => toast({ title: "Configuración guardada" })
    });
  };

  const getAccount = (platform: string) => accounts?.find(a => a.platform === platform) ?? null;
  const getAccountStatus = (platform: string) => {
    const acc = getAccount(platform);
    if (!acc) return null;
    return acc.connected === "true";
  };

  const metaConfigured = Boolean(metaAppId && metaAppSecret);
  // TikTok secret is masked when stored, so we only require the client key
  // to be present — the secret is always resolved at runtime from env vars or DB.
  const tiktokConfigured = Boolean(tiktokClientKey);

  async function handleDisconnectSocialAccount(platform: "instagram" | "tiktok") {
    const label = platform === "instagram" ? "Meta (Instagram + Facebook)" : "TikTok";
    const confirmed = window.confirm(`¿Seguro que quieres desconectar tu cuenta de ${label}? Los posts programados en estas plataformas dejarán de publicarse automáticamente.`);
    if (!confirmed) return;
    setDisconnectingPlatform(platform);
    try {
      const res = await fetch(`${BASE}/api/social-accounts/${platform}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Error al desconectar la cuenta.");
      }
      await refetchAccounts();
      if (platform === "instagram") setIgLinkStatus(null);
      toast({ title: `${label} desconectado`, description: "La cuenta ha sido desconectada correctamente." });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "No se pudo desconectar la cuenta.", variant: "destructive" });
    } finally {
      setDisconnectingPlatform(null);
    }
  }

  function startResendCooldown() {
    setCodeResendCooldown(60);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    resendTimerRef.current = setInterval(() => {
      setCodeResendCooldown(prev => {
        if (prev <= 1) { clearInterval(resendTimerRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSendDeleteCode() {
    setDeleteError("");
    try {
      const res = await fetch(`${BASE}/api/user/delete-account/send-code`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error ?? "No se pudo enviar el código."); return; }
      setCodeSent(true);
      setCodeSentTo(data.sentTo ?? "");
      startResendCooldown();
    } catch {
      setDeleteError("Error de red al enviar el código.");
    }
  }

  async function loadDeleteMethod() {
    setDeleteMethodLoading(true);
    setDeleteError("");
    try {
      const res = await fetch(`${BASE}/api/user/delete-account/method`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? "No se pudo determinar el método de confirmación.");
        return;
      }
      const method = data.method as "totp" | "password" | "email";
      setDeleteMethod(method);
      if (method === "email") await handleSendDeleteCode();
    } catch {
      setDeleteError("No se pudo determinar el método de confirmación.");
    } finally {
      setDeleteMethodLoading(false);
    }
  }

  function openDeleteDialog() {
    setDeleteDialogOpen(true);
    setDeleteConfirmValue("");
    setDeleteError("");
    setDeleteMethod(null);
    setCodeSent(false);
    setCodeSentTo("");
    setCodeResendCooldown(0);
    if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    loadDeleteMethod();
  }

  async function handleDeleteAccount() {
    setDeleteError("");
    setDeleteLoading(true);
    try {
      const res = await fetch(`${BASE}/api/user/delete-account`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: deleteConfirmValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? "Ocurrió un error. Intenta de nuevo.");
        return;
      }
      setDeleteDialogOpen(false);
      await logout();
      navigate("/login");
    } catch {
      setDeleteError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="space-y-8 pb-8 max-w-4xl">
      {showBrandWizard && (
        <OnboardingWizard
          editMode
          onComplete={() => {
            setShowBrandWizard(false);
            fetch(`${BASE}/api/brand-profile`, { credentials: "include" })
              .then(r => r.json())
              .then(d => setBrandProfile(d.profile))
              .catch(() => {});
          }}
          initialData={brandProfile ?? {}}
          initialStep={typeof brandProfile?.onboardingStep === "number" ? Math.min(brandProfile.onboardingStep, 4) : 0}
        />
      )}
      <div>
        <h1 className="text-4xl font-display font-bold text-foreground drop-shadow-[0_0_15px_rgba(0,201,83,0.3)] flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-primary" />
          Configuración del Sistema
        </h1>
        <p className="text-muted-foreground mt-2 font-medium">Aquí configuras todo lo necesario para que tu cuenta funcione: datos de tu marca, conexión a Instagram, TikTok y Facebook, y la automatización de publicaciones. Es importante completar estos datos antes de empezar a generar contenido.</p>
        {totalBusinesses > 1 && businessList.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Negocio activo:</span>
            {businessList.map(biz => (
              <button
                key={biz.id}
                onClick={() => { if (biz.id !== globalBusinessId) switchBusiness(biz.id); }}
                className={`text-xs px-3 py-1 rounded-full border transition-all ${
                  biz.id === globalBusinessId
                    ? "bg-primary text-primary-foreground border-primary font-semibold"
                    : "bg-card text-muted-foreground border-border/50 hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {biz.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Plan IA de publicación */}
      <AIPostingSuggestionsPanel collapsible={false} />

      {/* Brand Profile Card */}
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="font-display text-xl text-primary flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Perfil de Marca
          </CardTitle>
          <CardDescription>
            Tu identidad de marca — empresa, colores, tipografía, audiencia y tono. La IA usa estos datos para personalizar todo el contenido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {brandProfile ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {brandProfile.companyName && (
                  <div className="p-3 rounded-lg bg-black/20 border border-border/30">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Empresa</p>
                    <p className="text-sm font-medium text-foreground truncate">{String(brandProfile.companyName)}</p>
                  </div>
                )}
                {brandProfile.industry && (
                  <div className="p-3 rounded-lg bg-black/20 border border-border/30">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Industria</p>
                    <p className="text-sm font-medium text-foreground truncate">{String(brandProfile.industry)}</p>
                  </div>
                )}
                {brandProfile.brandTone && (
                  <div className="p-3 rounded-lg bg-black/20 border border-border/30">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tono</p>
                    <p className="text-sm font-medium text-foreground capitalize">{String(brandProfile.brandTone)}</p>
                  </div>
                )}
                {brandProfile.brandFont && (
                  <div className="p-3 rounded-lg bg-black/20 border border-border/30">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Tipografía</p>
                    <p className="text-sm font-medium text-foreground truncate">{String(brandProfile.brandFont)}</p>
                  </div>
                )}
              </div>
              {(brandProfile.primaryColor || brandProfile.secondaryColor) && (
                <div className="flex items-center gap-2">
                  {brandProfile.primaryColor && (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full border border-border" style={{ background: String(brandProfile.primaryColor) }} />
                      <span className="text-xs text-muted-foreground font-mono">{String(brandProfile.primaryColor)}</span>
                    </div>
                  )}
                  {brandProfile.secondaryColor && (
                    <div className="flex items-center gap-2 ml-2">
                      <div className="w-6 h-6 rounded-full border border-border" style={{ background: String(brandProfile.secondaryColor) }} />
                      <span className="text-xs text-muted-foreground font-mono">{String(brandProfile.secondaryColor)}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBrandWizard(true)}
                  className="border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Editar perfil de marca
                </Button>
                {["Empresa", "Marca", "Tipografía", "Audiencia", "Redes"].map((label, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setBrandProfile(prev => prev ? { ...prev, onboardingStep: i } : prev);
                      setShowBrandWizard(true);
                    }}
                    className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2 transition-colors"
                    title={`Ir al paso: ${label}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">No has configurado tu perfil de marca aún.</p>
              <Button
                onClick={() => setShowBrandWizard(true)}
                className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Completar perfil de marca
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Biblioteca de Elementos de Marca */}
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="font-display text-xl text-primary flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Elementos de Marca
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Logos secundarios, stickers, sellos y otros assets gráficos (PNG con fondo transparente) que se superponen sobre las imágenes de tus posts. Máximo 20 por negocio.
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Business selector — only shown when user has more than one business */}
          {elBusinessList.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground shrink-0">Negocio:</label>
              <select
                value={activeBusinessId ?? ""}
                onChange={e => {
                  const id = Number(e.target.value);
                  setActiveBusinessId(id);
                  setElRenamingId(null);
                  setShowElUploadWidget(false);
                  setElUploadFile(null);
                  setElUploadName("");
                }}
                className="text-sm bg-black/40 border border-border/40 rounded-md px-2 py-1 text-foreground focus:outline-none focus:border-primary/50 cursor-pointer"
              >
                {elBusinessList.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          {bizElementsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Cargando elementos…
            </div>
          ) : (
            <>
              {bizElements.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">No tienes elementos de marca aún. Sube tu primer asset (PNG con fondo transparente recomendado).</p>
                  <div className="space-y-2 max-w-sm">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <span className="flex-1 truncate text-xs text-muted-foreground/70 bg-black/30 border border-border/30 rounded px-3 py-2">
                        {elUploadFile ? elUploadFile.name : "Elegir imagen…"}
                      </span>
                      <span className="text-xs px-3 py-2 rounded border border-border/40 bg-white/5 hover:bg-white/10 text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
                        Buscar
                      </span>
                      <input
                        ref={elUploadInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setElUploadFile(f);
                          setElUploadName(f.name.replace(/\.[^.]+$/, "").slice(0, 60));
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {elUploadFile && (
                      <Input
                        value={elUploadName}
                        onChange={e => setElUploadName(e.target.value.slice(0, 60))}
                        placeholder="Nombre del elemento"
                        className="bg-black/50 border-border/50 text-sm"
                      />
                    )}
                    <Button
                      onClick={handleElementUploadSettings}
                      disabled={!elUploadFile || !elUploadName.trim() || elUploading}
                      size="sm"
                      className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 gap-2"
                    >
                      {elUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {elUploading ? "Subiendo…" : "Subir elemento"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3">
                    {bizElements.map(el => {
                      const isDeleting = elDeletingId === el.id;
                      return (
                        <div key={el.id} className="relative group/el">
                          <div
                            title={el.name}
                            className={`w-14 h-14 rounded-lg border-2 border-border/30 overflow-hidden bg-white/5 flex items-center justify-center ${isDeleting ? "opacity-40" : ""}`}
                          >
                            {el.thumbUrl ? (
                              <img src={el.thumbUrl} alt={el.name} className="w-full h-full object-contain" />
                            ) : (
                              <span className="text-[9px] text-muted-foreground px-0.5 text-center leading-tight">{el.name.slice(0, 8)}</span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground text-center mt-0.5 max-w-[56px] truncate">{el.name}</p>
                          {/* Delete button — appears on hover */}
                          <button
                            title="Eliminar elemento"
                            onClick={() => handleDeleteElement(el.id)}
                            disabled={isDeleting}
                            className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-destructive/80 hover:bg-destructive text-white flex items-center justify-center opacity-0 group-hover/el:opacity-100 transition-opacity z-10 disabled:cursor-not-allowed"
                          >
                            {isDeleting
                              ? <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                              : <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            }
                          </button>
                          {/* Rename button — appears on hover */}
                          <button
                            title="Renombrar elemento"
                            onClick={() => { setElRenamingId(el.id); setElRenameValue(el.name); }}
                            className="absolute -bottom-1.5 -left-1.5 w-5 h-5 rounded-full bg-background/90 border border-border/50 hover:border-primary/50 text-muted-foreground hover:text-primary flex items-center justify-center opacity-0 group-hover/el:opacity-100 transition-opacity z-10"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {/* Rename inline input */}
                  {elRenamingId !== null && (
                    <div className="flex items-center gap-2 border border-border/30 rounded-lg p-2 bg-black/20 max-w-sm">
                      <span className="text-xs text-muted-foreground/60 shrink-0">Nombre:</span>
                      <input
                        type="text"
                        value={elRenameValue}
                        onChange={e => setElRenameValue(e.target.value.slice(0, 100))}
                        autoFocus
                        className="flex-1 text-xs bg-white/5 border border-border/30 rounded px-2 py-1 text-foreground focus:outline-none focus:border-primary/50"
                        onKeyDown={e => {
                          if (e.key === "Enter") handleRenameElement(elRenamingId, elRenameValue);
                          if (e.key === "Escape") setElRenamingId(null);
                        }}
                      />
                      <button
                        onClick={() => handleRenameElement(elRenamingId, elRenameValue)}
                        disabled={!elRenameValue.trim()}
                        className="text-xs px-2 py-1 rounded border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
                      >
                        OK
                      </button>
                      <button
                        onClick={() => setElRenamingId(null)}
                        className="text-xs px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  {/* Upload new element section */}
                  <div>
                    {!showElUploadWidget ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowElUploadWidget(true)}
                        disabled={bizElements.length >= 20}
                        className="border-border/40 text-muted-foreground hover:text-foreground gap-2 text-xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {bizElements.length >= 20 ? "Límite de 20 elementos alcanzado" : `+ Subir elemento (${bizElements.length}/20)`}
                      </Button>
                    ) : (
                      <div className="space-y-2 max-w-sm border border-border/30 rounded-lg p-3 bg-black/20">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <span className="flex-1 truncate text-xs text-muted-foreground/70 bg-white/5 border border-border/30 rounded px-2 py-1.5">
                            {elUploadFile ? elUploadFile.name : "Elegir imagen…"}
                          </span>
                          <span className="text-xs px-2 py-1.5 rounded border border-border/40 bg-white/5 hover:bg-white/10 text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
                            Buscar
                          </span>
                          <input
                            ref={elUploadInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              setElUploadFile(f);
                              setElUploadName(f.name.replace(/\.[^.]+$/, "").slice(0, 60));
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {elUploadFile && (
                          <Input
                            value={elUploadName}
                            onChange={e => setElUploadName(e.target.value.slice(0, 60))}
                            placeholder="Nombre del elemento"
                            className="bg-black/50 border-border/50 text-xs h-8"
                          />
                        )}
                        <div className="flex gap-2">
                          <Button
                            onClick={handleElementUploadSettings}
                            disabled={!elUploadFile || !elUploadName.trim() || elUploading}
                            size="sm"
                            className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 gap-1.5 text-xs h-7"
                          >
                            {elUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                            {elUploading ? "Subiendo…" : "Subir"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setShowElUploadWidget(false); setElUploadFile(null); setElUploadName(""); }}
                            className="text-xs h-7 text-muted-foreground"
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* País del negocio — para filtro N2 en Biblioteca de Fondos */}
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="font-display text-xl text-primary flex items-center gap-2">
            <Globe className="w-5 h-5" />
            País del negocio
          </CardTitle>
          <CardDescription>
            El país se usa para filtrar la Biblioteca de Fondos: solo verás fondos de negocios de tu misma industria en otros países.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex gap-2 items-center">
              <select
                value={countryInput}
                onChange={e => setCountryInput(e.target.value)}
                className="flex h-9 w-full max-w-xs rounded-md border border-border/50 bg-black/50 px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">-- Sin país configurado --</option>
                <option value="CO">CO — Colombia</option>
                <option value="MX">MX — México</option>
                <option value="AR">AR — Argentina</option>
                <option value="ES">ES — España</option>
                <option value="PE">PE — Perú</option>
                <option value="CL">CL — Chile</option>
                <option value="VE">VE — Venezuela</option>
                <option value="EC">EC — Ecuador</option>
                <option value="BO">BO — Bolivia</option>
                <option value="PY">PY — Paraguay</option>
                <option value="UY">UY — Uruguay</option>
                <option value="CR">CR — Costa Rica</option>
                <option value="PA">PA — Panamá</option>
                <option value="DO">DO — Rep. Dominicana</option>
                <option value="GT">GT — Guatemala</option>
                <option value="HN">HN — Honduras</option>
                <option value="SV">SV — El Salvador</option>
                <option value="NI">NI — Nicaragua</option>
                <option value="CU">CU — Cuba</option>
                <option value="PR">PR — Puerto Rico</option>
              </select>
              <Button
                onClick={saveCountry}
                disabled={savingCountry}
                size="sm"
                className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30"
              >
                {savingCountry ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Guardar
              </Button>
            </div>
            {countryInput ? (
              <p className="text-xs text-primary/70">
                ✅ Activo: <strong>{countryInput}</strong> — verás fondos de negocios de tu misma industria en otros países.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sin país — no verás fondos de otros negocios en la Biblioteca de Fondos.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Zona horaria */}
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="font-display text-xl text-primary flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Zona horaria
          </CardTitle>
          <CardDescription>
            Configura dónde estás tú (para el calendario) y dónde opera el negocio. Útil si manejas redes sociales de negocios en otros países.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Usuario */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground/80">Tu zona horaria (calendario y aprobación)</Label>
            <p className="text-xs text-muted-foreground">El calendario y la cola de aprobación mostrarán las horas en esta zona. Déjalo en blanco para usar el país de tu cuenta.</p>
            <div className="flex gap-2 items-center">
              <select
                value={userTzInput}
                onChange={e => setUserTzInput(e.target.value)}
                className="flex h-9 w-full max-w-sm rounded-md border border-border/50 bg-black/50 px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">-- Automático (según país de la cuenta) --</option>
                <optgroup label="Latinoamérica">
                  <option value="America/Bogota">🇨🇴 Colombia (Bogotá)</option>
                  <option value="America/Mexico_City">🇲🇽 México (Ciudad de México)</option>
                  <option value="America/Argentina/Buenos_Aires">🇦🇷 Argentina (Buenos Aires)</option>
                  <option value="America/Lima">🇵🇪 Perú (Lima)</option>
                  <option value="America/Santiago">🇨🇱 Chile (Santiago)</option>
                  <option value="America/Caracas">🇻🇪 Venezuela (Caracas)</option>
                  <option value="America/Guayaquil">🇪🇨 Ecuador (Guayaquil)</option>
                  <option value="America/La_Paz">🇧🇴 Bolivia (La Paz)</option>
                  <option value="America/Asuncion">🇵🇾 Paraguay (Asunción)</option>
                  <option value="America/Montevideo">🇺🇾 Uruguay (Montevideo)</option>
                  <option value="America/Costa_Rica">🇨🇷 Costa Rica</option>
                  <option value="America/Panama">🇵🇦 Panamá</option>
                  <option value="America/Santo_Domingo">🇩🇴 Rep. Dominicana</option>
                  <option value="America/Guatemala">🇬🇹 Guatemala</option>
                  <option value="America/Tegucigalpa">🇭🇳 Honduras</option>
                  <option value="America/El_Salvador">🇸🇻 El Salvador</option>
                  <option value="America/Managua">🇳🇮 Nicaragua</option>
                  <option value="America/Havana">🇨🇺 Cuba</option>
                  <option value="America/Puerto_Rico">🇵🇷 Puerto Rico</option>
                  <option value="America/Sao_Paulo">🇧🇷 Brasil (São Paulo)</option>
                </optgroup>
                <optgroup label="Europa">
                  <option value="Europe/Madrid">🇪🇸 España (Madrid)</option>
                  <option value="Europe/Paris">🇫🇷 Francia (París)</option>
                  <option value="Europe/London">🇬🇧 Reino Unido (Londres)</option>
                  <option value="Europe/Berlin">🇩🇪 Alemania (Berlín)</option>
                  <option value="Europe/Rome">🇮🇹 Italia (Roma)</option>
                  <option value="Europe/Amsterdam">🇳🇱 Países Bajos</option>
                  <option value="Europe/Lisbon">🇵🇹 Portugal (Lisboa)</option>
                  <option value="Europe/Moscow">🇷🇺 Rusia (Moscú)</option>
                  <option value="Europe/Istanbul">🇹🇷 Turquía (Estambul)</option>
                </optgroup>
                <optgroup label="América del Norte">
                  <option value="America/New_York">🇺🇸 EE.UU. (Nueva York, EST)</option>
                  <option value="America/Chicago">🇺🇸 EE.UU. (Chicago, CST)</option>
                  <option value="America/Denver">🇺🇸 EE.UU. (Denver, MST)</option>
                  <option value="America/Los_Angeles">🇺🇸 EE.UU. (Los Ángeles, PST)</option>
                  <option value="America/Toronto">🇨🇦 Canadá (Toronto)</option>
                  <option value="America/Vancouver">🇨🇦 Canadá (Vancouver)</option>
                </optgroup>
                <optgroup label="Asia y Oceanía">
                  <option value="Asia/Dubai">🇦🇪 Emiratos Árabes (Dubái)</option>
                  <option value="Asia/Kolkata">🇮🇳 India (Kolkata)</option>
                  <option value="Asia/Bangkok">🇹🇭 Tailandia (Bangkok)</option>
                  <option value="Asia/Singapore">🇸🇬 Singapur</option>
                  <option value="Asia/Tokyo">🇯🇵 Japón (Tokio)</option>
                  <option value="Asia/Shanghai">🇨🇳 China (Shanghái)</option>
                  <option value="Australia/Sydney">🇦🇺 Australia (Sídney)</option>
                  <option value="Pacific/Auckland">🇳🇿 Nueva Zelanda (Auckland)</option>
                </optgroup>
                <optgroup label="Universal">
                  <option value="UTC">UTC (Coordinado Universal)</option>
                </optgroup>
              </select>
              <Button
                onClick={saveUserTimezone}
                disabled={savingUserTz}
                size="sm"
                className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30"
              >
                {savingUserTz ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Guardar
              </Button>
            </div>
            {userTzInput ? (
              <p className="text-xs text-primary/70">✅ Tu zona: <strong>{userTzInput}</strong></p>
            ) : (
              <p className="text-xs text-muted-foreground">Automático — se detecta desde el país de tu cuenta.</p>
            )}
          </div>

          <div className="border-t border-border/30" />

          {/* Negocio */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground/80">Zona horaria del negocio activo</Label>
            <p className="text-xs text-muted-foreground">Útil si gestionas redes de un negocio en otro país (ej: tú en Colombia, negocio en Francia). Guardado por negocio. Déjalo en blanco para heredar tu zona.</p>
            <div className="flex gap-2 items-center">
              <select
                value={bizTzInput}
                onChange={e => setBizTzInput(e.target.value)}
                className="flex h-9 w-full max-w-sm rounded-md border border-border/50 bg-black/50 px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">-- Heredar del usuario --</option>
                <optgroup label="Latinoamérica">
                  <option value="America/Bogota">🇨🇴 Colombia (Bogotá)</option>
                  <option value="America/Mexico_City">🇲🇽 México (Ciudad de México)</option>
                  <option value="America/Argentina/Buenos_Aires">🇦🇷 Argentina (Buenos Aires)</option>
                  <option value="America/Lima">🇵🇪 Perú (Lima)</option>
                  <option value="America/Santiago">🇨🇱 Chile (Santiago)</option>
                  <option value="America/Caracas">🇻🇪 Venezuela (Caracas)</option>
                  <option value="America/Guayaquil">🇪🇨 Ecuador (Guayaquil)</option>
                  <option value="America/La_Paz">🇧🇴 Bolivia (La Paz)</option>
                  <option value="America/Asuncion">🇵🇾 Paraguay (Asunción)</option>
                  <option value="America/Montevideo">🇺🇾 Uruguay (Montevideo)</option>
                  <option value="America/Costa_Rica">🇨🇷 Costa Rica</option>
                  <option value="America/Panama">🇵🇦 Panamá</option>
                  <option value="America/Santo_Domingo">🇩🇴 Rep. Dominicana</option>
                  <option value="America/Guatemala">🇬🇹 Guatemala</option>
                  <option value="America/Tegucigalpa">🇭🇳 Honduras</option>
                  <option value="America/El_Salvador">🇸🇻 El Salvador</option>
                  <option value="America/Managua">🇳🇮 Nicaragua</option>
                  <option value="America/Havana">🇨🇺 Cuba</option>
                  <option value="America/Puerto_Rico">🇵🇷 Puerto Rico</option>
                  <option value="America/Sao_Paulo">🇧🇷 Brasil (São Paulo)</option>
                </optgroup>
                <optgroup label="Europa">
                  <option value="Europe/Madrid">🇪🇸 España (Madrid)</option>
                  <option value="Europe/Paris">🇫🇷 Francia (París)</option>
                  <option value="Europe/London">🇬🇧 Reino Unido (Londres)</option>
                  <option value="Europe/Berlin">🇩🇪 Alemania (Berlín)</option>
                  <option value="Europe/Rome">🇮🇹 Italia (Roma)</option>
                  <option value="Europe/Amsterdam">🇳🇱 Países Bajos</option>
                  <option value="Europe/Lisbon">🇵🇹 Portugal (Lisboa)</option>
                  <option value="Europe/Moscow">🇷🇺 Rusia (Moscú)</option>
                  <option value="Europe/Istanbul">🇹🇷 Turquía (Estambul)</option>
                </optgroup>
                <optgroup label="América del Norte">
                  <option value="America/New_York">🇺🇸 EE.UU. (Nueva York, EST)</option>
                  <option value="America/Chicago">🇺🇸 EE.UU. (Chicago, CST)</option>
                  <option value="America/Denver">🇺🇸 EE.UU. (Denver, MST)</option>
                  <option value="America/Los_Angeles">🇺🇸 EE.UU. (Los Ángeles, PST)</option>
                  <option value="America/Toronto">🇨🇦 Canadá (Toronto)</option>
                  <option value="America/Vancouver">🇨🇦 Canadá (Vancouver)</option>
                </optgroup>
                <optgroup label="Asia y Oceanía">
                  <option value="Asia/Dubai">🇦🇪 Emiratos Árabes (Dubái)</option>
                  <option value="Asia/Kolkata">🇮🇳 India (Kolkata)</option>
                  <option value="Asia/Bangkok">🇹🇭 Tailandia (Bangkok)</option>
                  <option value="Asia/Singapore">🇸🇬 Singapur</option>
                  <option value="Asia/Tokyo">🇯🇵 Japón (Tokio)</option>
                  <option value="Asia/Shanghai">🇨🇳 China (Shanghái)</option>
                  <option value="Australia/Sydney">🇦🇺 Australia (Sídney)</option>
                  <option value="Pacific/Auckland">🇳🇿 Nueva Zelanda (Auckland)</option>
                </optgroup>
                <optgroup label="Universal">
                  <option value="UTC">UTC (Coordinado Universal)</option>
                </optgroup>
              </select>
              <Button
                onClick={saveBizTimezone}
                disabled={savingBizTz || !globalBusinessId}
                size="sm"
                className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30"
              >
                {savingBizTz ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Guardar
              </Button>
            </div>
            {bizTzInput ? (
              <p className="text-xs text-primary/70">✅ Negocio en: <strong>{bizTzInput}</strong></p>
            ) : (
              <p className="text-xs text-muted-foreground">Sin zona específica — el negocio usa la zona del usuario.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preferencias de publicación — Ubicación predeterminada */}
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <CardTitle className="font-display text-xl text-primary flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Ubicación predeterminada
          </CardTitle>
          <CardDescription>
            La IA usará esta ciudad automáticamente en hashtags y menciones. Déjalo en blanco si no quieres ubicación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="ej: Madrid, Ciudad de México, Buenos Aires"
                value={defaultLocationInput}
                onChange={e => setDefaultLocationInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveDefaultLocation(); }}
                className="bg-black/50 border-border/50 max-w-xs"
              />
              <Button
                onClick={saveDefaultLocation}
                disabled={savingLocation}
                size="sm"
                className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30"
              >
                {savingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Guardar
              </Button>
              {defaultLocationInput.trim() && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setDefaultLocationInput(""); }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  Limpiar
                </Button>
              )}
            </div>
            {brandProfile?.defaultLocation ? (
              <p className="text-xs text-primary/70">
                ✅ Activa: <strong>{String(brandProfile.defaultLocation)}</strong> — la IA añade hashtags de esta ubicación automáticamente.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sin ubicación — la IA no añadirá hashtags de ciudad.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground/60">
              Si guardas una ciudad, la IA incluirá automáticamente hashtags de esa ubicación en cada publicación nueva.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Motivación: conectar APIs */}
      {!accountsLoading && accounts && accounts.length === 0 && (
        <Card className="glass-card border-cyan-400/30 bg-gradient-to-r from-cyan-500/10 via-black/40 to-cyan-500/5">
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">⚡</span>
              <div>
                <p className="font-bold text-cyan-300 text-sm">Conecta tus APIs y desbloquea el 100% de HazPost</p>
                <p className="text-xs text-muted-foreground mt-1">Ahora mismo solo puedes generar contenido. Conectando Meta y TikTok obtienes publicación automática y datos reales.</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/30">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Función</th>
                    <th className="text-center py-2 px-3 text-red-400 font-medium">Sin API</th>
                    <th className="text-center py-2 px-3 text-cyan-400 font-medium">Con API</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    ["Publicación automática", "❌ Manual", "✅ Automática"],
                    ["Estadísticas de alcance y likes", "❌ No disponibles", "✅ Se importan"],
                    ["Verificar si un post se publicó", "❌ No", "✅ Sí"],
                    ["Ver qué contenido funciona mejor", "❌ No", "✅ Sí (datos reales)"],
                  ].map(([feat, no, yes]) => (
                    <tr key={feat}>
                      <td className="py-2 px-3 text-muted-foreground">{feat}</td>
                      <td className="py-2 px-3 text-center text-red-400/80">{no}</td>
                      <td className="py-2 px-3 text-center text-green-400">{yes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground/60">Configura las credenciales de Meta o TikTok en la sección de abajo para empezar.</p>
          </CardContent>
        </Card>
      )}

      {/* Cómo conectar redes — banner de guía rápida */}
      <div className="rounded-2xl border border-[#00C2FF]/30 bg-gradient-to-br from-[#00C2FF]/8 to-transparent p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#00C2FF]/15 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5 text-[#00C2FF]" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">¿Cómo conectar tus redes sociales?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Para publicar automáticamente necesitas conectar Instagram/Facebook y/o TikTok. También puedes conectar Telegram para notificaciones.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            { icon: <Instagram className="w-4 h-4 text-pink-400" />, label: "Instagram + Facebook", desc: "Publicación automática, estadísticas y alcance real", time: "20–30 min" },
            { icon: <PlaySquare className="w-4 h-4 text-sky-400" />, label: "TikTok", desc: "Publicación directa de videos y reels en TikTok", time: "10–15 min" },
            { icon: <Send className="w-4 h-4 text-blue-400" />, label: "Telegram Bot", desc: "Alertas de publicación y leads calientes en tiempo real", time: "5 min" },
          ].map(({ icon, label, desc, time }) => (
            <div key={label} className="p-3 rounded-xl bg-black/30 border border-white/10 space-y-1.5">
              <div className="flex items-center gap-2">{icon}<span className="font-semibold text-foreground">{label}</span></div>
              <p className="text-muted-foreground leading-relaxed">{desc}</p>
              <p className="text-muted-foreground/60">⏱ {time}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => document.getElementById("api-guides-section")?.scrollIntoView({ behavior: "smooth" })}
          className="text-xs text-[#00C2FF] hover:text-[#00C2FF]/80 transition-colors flex items-center gap-1 font-medium"
        >
          Ver instrucciones paso a paso ↓
        </button>
      </div>

      {/* Platform App Credentials */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="font-display text-xl text-primary flex items-center gap-2">
            <Key className="w-5 h-5" />
            Credenciales de Aplicación
          </CardTitle>
          <CardDescription>
            Registra tus apps de Meta y TikTok, luego haz clic en "Autorizar" para conectar via OAuth.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Meta / Instagram */}
          <div className="space-y-4 p-4 rounded-xl bg-black/20 border border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-bold">
                <Instagram className="w-5 h-5 text-pink-500" />
                Meta Business (Instagram)
              </div>
              {accountsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                getAccountStatus("instagram") === true ?
                  <div className="flex items-center gap-1 text-xs font-bold text-primary uppercase tracking-wider"><CheckCircle2 className="w-4 h-4" /> Cuenta vinculada{getAccount("instagram")?.username ? `: ${getAccount("instagram")?.username}` : ""}</div> :
                metaConfigured ?
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-400 uppercase tracking-wider"><AlertCircle className="w-4 h-4" /> App lista — falta autorizar</div> :
                  <div className="flex items-center gap-1 text-xs font-bold text-destructive uppercase tracking-wider"><XCircle className="w-4 h-4" /> Sin configurar</div>
              }
            </div>
            <p className="text-xs text-muted-foreground">
              Necesitas un{" "}
              <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="text-secondary underline inline-flex items-center gap-1">
                Meta Developer App <ExternalLink className="w-3 h-3" />
              </a>{" "}
              con permisos: <code className="text-xs bg-black/30 px-1 rounded">instagram_basic, instagram_content_publish, pages_manage_posts</code>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Meta App ID</Label>
                <Input
                  value={metaAppId}
                  onChange={e => setMetaAppId(e.target.value)}
                  placeholder="1234567890"
                  className="bg-black/50 border-border/50 font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label>Meta App Secret {settings?.meta_app_secret === "••••••••" || !settings?.meta_app_secret ? <span className="text-xs text-yellow-400 ml-1">(requiere reingreso)</span> : <span className="text-xs text-emerald-400 ml-1">✓ guardado</span>}</Label>
                <Input
                  type="password"
                  value={metaAppSecret}
                  onChange={e => setMetaAppSecret(e.target.value)}
                  placeholder="Ingresa el App Secret (dejar vacío para mantener actual)"
                  className="bg-black/50 border-border/50 font-mono"
                />
              </div>
            </div>
            {activeBusinessName && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium w-fit ${totalBusinesses > 1 ? "bg-violet-500/20 border border-violet-400/50 text-violet-300" : "bg-black/20 border border-border/30 text-muted-foreground"}`}>
                <span className="opacity-70">Se conectará al negocio:</span>
                {totalBusinesses > 1 ? (
                  <select
                    value={globalBusinessId}
                    onChange={e => switchBusiness(Number(e.target.value))}
                    className="bg-transparent text-violet-200 font-semibold border-none outline-none cursor-pointer text-xs appearance-none"
                  >
                    {businessList.map(b => (
                      <option key={b.id} value={b.id} className="bg-[#1a1a2e] text-white">{b.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-foreground">{activeBusinessName}</span>
                )}
                {totalBusinesses > 1 && <ChevronDown className="w-3 h-3 text-violet-400 pointer-events-none" />}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={handleConnectMeta}
                disabled={!metaConfigured}
                className="bg-pink-600/20 text-pink-400 border border-pink-500/50 hover:bg-pink-600/30"
                title={!metaConfigured ? "Guarda primero el App ID y Secret" : "Autoriza con Meta para conectar Instagram y Facebook"}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Autorizar con Meta
              </Button>
              {getAccountStatus("instagram") && (
                <Button
                  variant="ghost"
                  onClick={() => handleTestConnection("instagram")}
                  disabled={testAccount.isPending}
                  className="text-muted-foreground hover:text-primary"
                >
                  {testAccount.isPending ? "Probando..." : "Probar conexión"}
                </Button>
              )}
              {getAccountStatus("instagram") && (
                <Button
                  variant="ghost"
                  onClick={() => handleDisconnectSocialAccount("instagram")}
                  disabled={disconnectingPlatform === "instagram"}
                  className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                >
                  {disconnectingPlatform === "instagram" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Desconectar
                </Button>
              )}
              {igLinkStatus === "linked" && (
                <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Facebook ✓ · Instagram ✓
                </span>
              )}
              {igLinkStatus === "not_linked" && (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs">
                  <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Facebook conectado · Instagram no detectado
                  </span>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground pl-0.5">
                    <li>En Instagram → Configuración → <strong className="text-foreground">Tipo de cuenta</strong> → cambia a <strong className="text-foreground">Empresarial o Creador</strong> (no Personal)</li>
                    <li>En Instagram → Configuración → <strong className="text-foreground">Centro de Cuentas</strong> → vincula tu Página de Facebook</li>
                    <li>Vuelve aquí y haz clic en <strong className="text-foreground">"Autorizar con Meta"</strong> de nuevo</li>
                  </ol>
                </div>
              )}
            </div>

            {/* Auto-renew button — admin only */}
            <div className="flex items-center justify-between rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-4 py-2.5">
              <div>
                <p className="text-xs font-medium text-emerald-400">Renovar token automáticamente</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">Usa el App ID y Secret guardados para extender el token 60 días más</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleAutoRenewMetaToken}
                disabled={autoRenewing}
                className="text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10 shrink-0 ml-3"
              >
                {autoRenewing
                  ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Renovando…</>
                  : <>🔄 Renovar ahora</>}
              </Button>
            </div>

            {/* Token exchange — renew for 60-day token */}
            <div className="border border-dashed border-amber-500/40 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowExchangeToken(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs hover:bg-white/5 transition-colors"
              >
                <span className="flex items-center gap-2 text-amber-400 font-semibold">
                  <Key className="w-3 h-3" />
                  Renovar token (larga duración — 60 días)
                </span>
                {showExchangeToken ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
              </button>
              {showExchangeToken && (
                <div className="px-4 pb-4 space-y-3 border-t border-dashed border-amber-500/30 pt-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Requiere que hayas guardado el <strong>App ID</strong> y <strong>App Secret</strong> arriba.
                    Ve al{" "}
                    <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" className="text-secondary underline">
                      Explorador de la API de Meta
                    </a>
                    , genera un User Token con permisos <code className="bg-black/30 px-1 rounded">instagram_basic</code> e <code className="bg-black/30 px-1 rounded">instagram_content_publish</code>,
                    y pégalo aquí. El sistema lo canjea automáticamente por un token de 60 días.
                  </p>
                  <div className="grid gap-2">
                    <Label className="text-xs">User Token del API Explorer (corta duración)</Label>
                    <Textarea
                      value={exchangeUserToken}
                      onChange={e => setExchangeUserToken(e.target.value)}
                      placeholder="EAAOAXZCv0d1UBRK..."
                      className="bg-black/50 border-border/50 font-mono text-xs h-20 resize-none"
                    />
                  </div>
                  <Button
                    onClick={() => handleExchangeToken()}
                    disabled={exchangingToken || !exchangeUserToken.trim()}
                    size="sm"
                    className="bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/30"
                  >
                    {exchangingToken ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Key className="w-3 h-3 mr-2" />}
                    Canjear por token de 60 días
                  </Button>
                </div>
              )}
            </div>

            {/* Manual token fallback */}
            <div className="border border-dashed border-border/40 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowManualMeta(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              >
                <span>Conectar con token manual de Página (avanzado)</span>
                {showManualMeta ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showManualMeta && (
                <div className="px-4 pb-4 space-y-3 border-t border-dashed border-border/30 pt-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Pega directamente un Page Access Token (obtenido de <code className="bg-black/30 px-1 rounded">me/accounts</code>). El Page ID ya está configurado como <code className="bg-black/30 px-1 rounded">356577317549386</code>.
                  </p>
                  <div className="grid gap-2">
                    <Label className="text-xs">Page Access Token</Label>
                    <Textarea
                      value={manualMetaToken}
                      onChange={e => setManualMetaToken(e.target.value)}
                      placeholder="EAABsbCS..."
                      className="bg-black/50 border-border/50 font-mono text-xs h-20 resize-none"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-xs">ID de la Página de Facebook (Page ID)</Label>
                    <Input
                      value={manualMetaPageId}
                      onChange={e => setManualMetaPageId(e.target.value)}
                      placeholder="356577317549386"
                      className="bg-black/50 border-border/50 font-mono text-xs"
                    />
                  </div>
                  <Button
                    onClick={handleSaveManualMetaToken}
                    disabled={savingManualMeta || !manualMetaToken || !manualMetaPageId}
                    size="sm"
                    className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30"
                  >
                    {savingManualMeta ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Save className="w-3 h-3 mr-2" />}
                    Guardar token manual
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* TikTok */}
          <div className="space-y-4 p-4 rounded-xl bg-black/20 border border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-bold">
                <PlaySquare className="w-5 h-5 text-cyan-400" />
                TikTok Content Posting
              </div>
              {accountsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                getAccountStatus("tiktok") === true ?
                  <div className="flex items-center gap-1 text-xs font-bold text-primary uppercase tracking-wider"><CheckCircle2 className="w-4 h-4" /> Cuenta vinculada{getAccount("tiktok")?.username ? `: ${getAccount("tiktok")?.username}` : ""}</div> :
                tiktokConfigured ?
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-400 uppercase tracking-wider"><AlertCircle className="w-4 h-4" /> App lista — falta autorizar</div> :
                  <div className="flex items-center gap-1 text-xs font-bold text-destructive uppercase tracking-wider"><XCircle className="w-4 h-4" /> Sin configurar</div>
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {tiktokClientKey
                ? <>Credenciales activas vía Secrets. </>
                : <>Ingresa el Client Key y Secret, o guárdalos como Secrets del entorno. </>
              }
              <a href="https://developers.tiktok.com/apps/" target="_blank" rel="noreferrer" className="text-secondary underline inline-flex items-center gap-1">
                TikTok Developer Portal <ExternalLink className="w-3 h-3" />
              </a>
              {" "}— Scopes: <code className="text-xs bg-black/30 px-1 rounded">user.info.basic, video.publish, video.upload</code>
            </p>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs font-mono text-cyan-300">
              <span className="text-cyan-500/60 shrink-0">Redirect URI →</span>
              <span className="truncate">https://hazpost.app/api/auth/tiktok/callback</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>TikTok Client Key</Label>
                <Input
                  value={tiktokClientKey}
                  onChange={e => setTiktokClientKey(e.target.value)}
                  placeholder="awxxxxxxxxxx"
                  className="bg-black/50 border-border/50 font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label>TikTok Client Secret</Label>
                <Input
                  type="password"
                  value={tiktokClientSecret}
                  onChange={e => setTiktokClientSecret(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="bg-black/50 border-border/50 font-mono"
                />
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border-2 border-amber-400/50">
              <span className="text-amber-400 text-lg leading-none mt-0.5">⚠️</span>
              <div>
                <p className="text-sm font-bold text-amber-300">Paso importante antes de autorizar</p>
                <p className="text-xs text-amber-200/80 mt-1">
                  <strong>1. Ingresa el Client Key y el Client Secret</strong> en los campos de arriba.<br />
                  <strong>2. Haz clic en "Guardar configuración"</strong> (botón al final de la página).<br />
                  <strong>3. Solo después</strong> haz clic en "Autorizar con TikTok".<br />
                  Si autorizas sin guardar primero, la conexión fallará.
                </p>
              </div>
            </div>
            {activeBusinessName && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium w-fit ${totalBusinesses > 1 ? "bg-violet-500/20 border border-violet-400/50 text-violet-300" : "bg-black/20 border border-border/30 text-muted-foreground"}`}>
                <span className="opacity-70">Se conectará al negocio:</span>
                {totalBusinesses > 1 ? (
                  <select
                    value={globalBusinessId}
                    onChange={e => switchBusiness(Number(e.target.value))}
                    className="bg-transparent text-violet-200 font-semibold border-none outline-none cursor-pointer text-xs appearance-none"
                  >
                    {businessList.map(b => (
                      <option key={b.id} value={b.id} className="bg-[#1a1a2e] text-white">{b.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-foreground">{activeBusinessName}</span>
                )}
                {totalBusinesses > 1 && <ChevronDown className="w-3 h-3 text-violet-400 pointer-events-none" />}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={handleConnectTikTok}
                disabled={!tiktokConfigured}
                className="bg-cyan-600/20 text-cyan-400 border border-cyan-500/50 hover:bg-cyan-600/30"
                title={!tiktokConfigured ? "Guarda primero el Client Key y Secret" : ""}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Autorizar con TikTok
              </Button>
              {getAccountStatus("tiktok") && (
                <Button
                  variant="ghost"
                  onClick={() => handleTestConnection("tiktok")}
                  disabled={testAccount.isPending}
                  className="text-muted-foreground hover:text-primary"
                >
                  {testAccount.isPending ? "Probando..." : "Probar conexión"}
                </Button>
              )}
              {getAccountStatus("tiktok") && (
                <Button
                  variant="ghost"
                  onClick={() => handleDisconnectSocialAccount("tiktok")}
                  disabled={disconnectingPlatform === "tiktok"}
                  className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
                >
                  {disconnectingPlatform === "tiktok" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Desconectar
                </Button>
              )}
            </div>
          </div>

          {/* Facebook Page */}
          <div className="space-y-4 p-4 rounded-xl bg-black/20 border border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-bold">
                <Globe className="w-5 h-5 text-blue-400" />
                Tu Página de Facebook
              </div>
              {accountsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                getAccountStatus("instagram") ?
                  <div className="flex items-center gap-1 text-xs font-bold text-primary uppercase tracking-wider"><CheckCircle2 className="w-4 h-4" /> Conectada</div> :
                  <div className="flex items-center gap-1 text-xs font-bold text-amber-400 uppercase tracking-wider"><ExternalLink className="w-4 h-4" /> Acceso vía Instagram</div>
              }
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">URL de la Página</Label>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-blue-400 text-sm font-medium flex-1 truncate">
                  Página vinculada a tu cuenta de Instagram Business
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                La Página de Facebook comparte el mismo token de acceso que Instagram. Al publicar en "Todas las plataformas", el scheduler publica nativamente en IG, TikTok y esta Página de Facebook — sin necesidad de credenciales adicionales.
              </p>
              <p className="text-xs text-amber-400/80">
                ⚠ La publicación en Facebook requiere el permiso <code className="bg-black/30 px-1 rounded">pages_manage_posts</code>, que Meta exige App Review para apps en modo Live. Mientras tanto, los posts en Facebook pueden fallar.
              </p>
            </div>
            {getAccountStatus("instagram") && (
              <Button
                variant="ghost"
                onClick={() => handleTestConnection("facebook")}
                disabled={testAccount.isPending}
                className="text-muted-foreground hover:text-blue-400"
              >
                {testAccount.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Globe className="w-4 h-4 mr-2" />}
                Probar conexión Facebook
              </Button>
            )}
          </div>

          <Button onClick={handleSaveCredentials} className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30">
            <Save className="w-4 h-4 mr-2" /> Guardar App IDs y Secrets
          </Button>
        </CardContent>
      </Card>

      {/* Telegram Notifications */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="font-display text-xl flex items-center gap-2" style={{ color: "#2AABEE" }}>
            <Bell className="w-5 h-5" style={{ color: "#2AABEE" }} />
            Notificaciones Telegram
            {telegramConfigured && (
              <span className="ml-2 text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Activo
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Recibe alertas en tiempo real cuando el sistema publique posts, falle o genere contenido automáticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-4 p-4 rounded-xl bg-black/20 border border-[#2AABEE]/20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  Bot Token
                  {telegramConfigured && !telegramToken && (
                    <span className="text-xs text-emerald-400">✓ guardado</span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={telegramToken}
                  onChange={e => setTelegramToken(e.target.value)}
                  placeholder={telegramConfigured ? "••••••••  (dejar vacío = mantener)" : "8637103599:AAEZCi..."}
                  className="bg-black/50 border-border/50 font-mono"
                />
              </div>
              <div className="grid gap-2">
                <Label>Chat ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={telegramChatId}
                    onChange={e => setTelegramChatId(e.target.value)}
                    placeholder="123456789"
                    className="bg-black/50 border-border/50 font-mono flex-1"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleDetectChatId}
                    disabled={detectingChatId}
                    title="Detectar Chat ID automáticamente"
                    className="border-[#2AABEE]/40 text-[#2AABEE] hover:bg-[#2AABEE]/10 shrink-0"
                  >
                    {detectingChatId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Envíale <code className="bg-black/30 px-1 rounded">/start</code> al bot y presiona la lupa para detectar tu ID automáticamente.
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={handleSaveTelegram}
                disabled={savingTelegram || (!telegramToken && !telegramChatId)}
                className="bg-[#2AABEE]/20 text-[#2AABEE] border border-[#2AABEE]/50 hover:bg-[#2AABEE]/30"
              >
                {savingTelegram ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar configuración
              </Button>
              <Button
                variant="outline"
                onClick={handleTestTelegram}
                disabled={testingTelegram || (!telegramConfigured && !telegramChatId)}
                className="border-[#2AABEE]/40 text-[#2AABEE] hover:bg-[#2AABEE]/10"
              >
                {testingTelegram ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar prueba
              </Button>
            </div>

            {/* Setup guide */}
            <div className="border border-dashed border-[#2AABEE]/30 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowTelegramGuide(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2 text-xs hover:bg-white/5 transition-colors"
              >
                <span className="flex items-center gap-2 text-[#2AABEE]/80 font-semibold">
                  ¿Cómo configurarlo? — Guía paso a paso
                </span>
                {showTelegramGuide ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
              </button>
              {showTelegramGuide && (
                <div className="px-4 pb-4 space-y-2 border-t border-dashed border-[#2AABEE]/20 pt-3 text-xs text-muted-foreground leading-relaxed">
                  <p><strong className="text-foreground">Paso 1 — Obtén el Bot Token</strong></p>
                  <p>Abre Telegram y busca <code className="bg-black/30 px-1 rounded">@BotFather</code> (palomita azul verificada). Escribe <code className="bg-black/30 px-1 rounded">/newbot</code>, ponle nombre y username a tu gusto. El token que te dará va en el campo "Bot Token".</p>
                  <p className="mt-2"><strong className="text-foreground">Paso 2 — Detecta tu Chat ID</strong></p>
                  <p>Busca tu bot en Telegram y envíale <code className="bg-black/30 px-1 rounded">/start</code>. Luego vuelve aquí, pega el Token, guárdalo, y presiona la lupa 🔍 junto al campo Chat ID para detectarlo automáticamente.</p>
                  <p className="mt-2"><strong className="text-foreground">Paso 3 — Prueba la conexión</strong></p>
                  <p>Presiona "Enviar prueba" — deberías recibir un mensaje verde en Telegram confirmando que todo funciona.</p>
                </div>
              )}
            </div>

            {/* What you'll receive */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              {[
                { icon: "✅", label: "Post publicado", desc: "Con plataformas y preview del caption" },
                { icon: "❌", label: "Post falló", desc: "Con detalle del error y acción requerida" },
                { icon: "🤖", label: "Auto-generación", desc: "Cuando el sistema crea contenido nuevo" },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-2 p-3 rounded-lg bg-black/20 border border-border/20">
                  <span className="text-lg leading-none mt-0.5">{item.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Automation Settings — per business */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="font-display text-xl text-primary">Protocolos de Automatización</CardTitle>
          <CardDescription>
            Configuración de auto-generación de contenido por negocio.
            {autoGenBusinessName && (
              <span className="ml-1 font-medium text-foreground">Editando: <span className="text-primary">{autoGenBusinessName}</span></span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Business selector — shown when user has multiple businesses */}
          {autoGenBusinessList.length > 1 && (
            <div className="grid gap-2">
              <Label>Negocio</Label>
              <select
                value={autoGenBusinessId ?? ""}
                onChange={e => {
                  const id = Number(e.target.value);
                  if (id) loadAutoGenSettings(id);
                }}
                className="flex h-10 w-full items-center justify-between rounded-md border border-border/50 bg-black/50 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {autoGenBusinessList.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Toggle — auto-generation on/off */}
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-black/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Auto-generación de contenido</p>
              <p className="text-xs text-muted-foreground mt-0.5">El scheduler crea posts automáticamente según la frecuencia configurada.</p>
            </div>
            <Switch
              checked={autoGenEnabled}
              onCheckedChange={setAutoGenEnabled}
            />
          </div>

          {/* Frequency selector */}
          <div className="grid gap-2">
            <Label>Frecuencia de generación</Label>
            <select
              value={genFreq}
              onChange={e => setGenFreq(e.target.value)}
              disabled={!autoGenEnabled}
              className="flex h-10 w-full items-center justify-between rounded-md border border-border/50 bg-black/50 px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="7">Semanal — genera posts para los próximos 7 días</option>
              <option value="15">Quincenal — genera posts para los próximos 15 días</option>
              <option value="30">Mensual — genera posts para los próximos 30 días</option>
            </select>
          </div>

          {/* Optimal windows — informational only */}
          <div className="grid gap-2">
            <Label>Ventanas óptimas de publicación (Bogotá)</Label>
            <div className="flex gap-3">
              {["8:00 AM", "12:00 PM", "6:00 PM"].map(hour => (
                <span key={hour} className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-sm text-primary font-mono font-bold">
                  {hour}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">La auto-generación se ejecuta diariamente a las 6:00 AM (Bogotá). El scheduler publica en las ventanas óptimas de engagement.</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleSaveAutoGenSettings} disabled={savingAutoGen || !autoGenBusinessId} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_15px_rgba(0,201,83,0.4)]">
              <Save className="w-4 h-4 mr-2" />
              {savingAutoGen ? "Guardando..." : "Guardar configuración"}
            </Button>
            <Button
              variant="outline"
              onClick={handleDisableAllAutoGen}
              disabled={disablingAll}
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              {disablingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PowerOff className="w-4 h-4 mr-2" />}
              {disablingAll ? "Desactivando..." : "Apagar para todos mis negocios"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2FA / Google Authenticator */}
      <TwoFactorSettings />

      {/* API Setup Guides */}
      <div id="api-guides-section">
        <ApiGuidesSection igConnected={getAccountStatus("instagram")} ttConnected={getAccountStatus("tiktok")} />
      </div>

      {/* Zona de peligro — solo usuarios no-admin */}
      {user?.role !== "admin" && (
        <div className="border border-red-500/30 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-red-500/5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-sm font-semibold text-red-400">Zona de peligro</span>
          </div>
          <div className="px-4 py-4 border-t border-red-500/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Eliminar mi cuenta</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tu cuenta y todos sus datos pasarán a la papelera. Tendrás 30 días para solicitar recuperación contactando a soporte. Después de ese periodo se eliminará de forma permanente.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:text-red-300 shrink-0"
              onClick={openDeleteDialog}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Eliminar cuenta
            </Button>
          </div>
        </div>
      )}

      {/* Dialog de confirmación de transferencia de cuenta social */}
      <Dialog open={!!transferConflict} onOpenChange={open => { if (!confirmingTransfer && !open) { setTransferConflict(null); setPendingTransferPageId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              ¿Transferir cuenta de Instagram?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-1">
                <p>
                  Esta página de Facebook ya está vinculada al negocio{" "}
                  <strong className="text-foreground">{transferConflict?.fromBusinessName}</strong>.
                </p>
                <p>
                  Si continúas, la conexión de Instagram se moverá a este negocio y{" "}
                  <strong className="text-foreground">{transferConflict?.fromBusinessName}</strong>{" "}
                  dejará de publicar en esa cuenta.
                </p>
                <p className="text-xs text-muted-foreground">
                  Si seleccionaste el negocio incorrecto, cierra este diálogo y vuelve a intentar con el negocio correcto.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => { setTransferConflict(null); setPendingTransferPageId(null); }}
              disabled={confirmingTransfer}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              className="bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleConfirmTransfer}
              disabled={confirmingTransfer}
            >
              {confirmingTransfer ? "Transfiriendo..." : "Sí, transferir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación — 3 niveles */}
      <Dialog open={deleteDialogOpen} onOpenChange={open => { if (!deleteLoading) { setDeleteDialogOpen(open); if (!open && resendTimerRef.current) clearInterval(resendTimerRef.current); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              Eliminar mi cuenta
            </DialogTitle>
            <DialogDescription>
              Esta acción moverá tu cuenta a la papelera. Tendrás <strong>30 días</strong> para recuperarla contactando al soporte. Después de ese plazo se eliminará permanentemente junto a todos tus datos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Loading method */}
            {deleteMethodLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando método de verificación…
              </div>
            )}

            {/* TOTP field */}
            {deleteMethod === "totp" && (
              <div className="space-y-2">
                <Label htmlFor="delete-confirm-code" className="text-sm flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  Código de Google Authenticator
                </Label>
                <Input
                  id="delete-confirm-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={deleteConfirmValue}
                  onChange={e => { setDeleteConfirmValue(e.target.value.replace(/\D/g, "")); setDeleteError(""); }}
                  placeholder="000000"
                  disabled={deleteLoading}
                  onKeyDown={e => { if (e.key === "Enter") handleDeleteAccount(); }}
                  autoComplete="one-time-code"
                  className="font-mono tracking-widest text-center text-lg"
                />
                <p className="text-xs text-muted-foreground">Abre tu app autenticadora e ingresa el código de 6 dígitos.</p>
              </div>
            )}

            {/* Password field */}
            {deleteMethod === "password" && (
              <div className="space-y-2">
                <Label htmlFor="delete-confirm-code" className="text-sm flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-muted-foreground" />
                  Tu contraseña actual
                </Label>
                <Input
                  id="delete-confirm-code"
                  type="password"
                  value={deleteConfirmValue}
                  onChange={e => { setDeleteConfirmValue(e.target.value); setDeleteError(""); }}
                  placeholder="Ingresa tu contraseña"
                  disabled={deleteLoading}
                  onKeyDown={e => { if (e.key === "Enter") handleDeleteAccount(); }}
                  autoComplete="current-password"
                />
              </div>
            )}

            {/* Email OTP field */}
            {deleteMethod === "email" && (
              <div className="space-y-3">
                {codeSent ? (
                  <>
                    <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400">
                      Código enviado a <strong>{codeSentTo}</strong>. Válido por 10 minutos.
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="delete-confirm-code" className="text-sm">Código de verificación (6 dígitos)</Label>
                      <Input
                        id="delete-confirm-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={deleteConfirmValue}
                        onChange={e => { setDeleteConfirmValue(e.target.value.replace(/\D/g, "")); setDeleteError(""); }}
                        placeholder="000000"
                        disabled={deleteLoading}
                        onKeyDown={e => { if (e.key === "Enter") handleDeleteAccount(); }}
                        autoComplete="one-time-code"
                        className="font-mono tracking-widest text-center text-lg"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground px-0"
                      disabled={codeResendCooldown > 0}
                      onClick={handleSendDeleteCode}
                    >
                      {codeResendCooldown > 0 ? `Reenviar en ${codeResendCooldown}s` : "Reenviar código"}
                    </Button>
                  </>
                ) : deleteMethodLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enviando código a tu correo…
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">No se pudo enviar el código automáticamente.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-border/50 text-sm"
                      disabled={codeResendCooldown > 0}
                      onClick={handleSendDeleteCode}
                    >
                      {codeResendCooldown > 0 ? `Espera ${codeResendCooldown}s` : "Enviar código al correo"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {deleteError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {deleteError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); if (resendTimerRef.current) clearInterval(resendTimerRef.current); }} disabled={deleteLoading}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteAccount}
              disabled={
                deleteLoading ||
                deleteMethodLoading ||
                !deleteMethod ||
                (deleteMethod === "email" && !codeSent) ||
                !deleteConfirmValue.trim() ||
                (deleteMethod !== "password" && /\D/.test(deleteConfirmValue)) ||
                (deleteMethod !== "password" && deleteConfirmValue.replace(/\D/g, "").length !== 6)
              }
            >
              {deleteLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {deleteLoading ? "Eliminando…" : "Sí, eliminar mi cuenta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Selector de página de Facebook/Instagram ─────────────────── */}
      <Dialog
        open={showPageSelector}
        onOpenChange={open => {
          // Only allow closing if from exchange-token flow (not from OAuth redirect)
          // oauth_pending sessions must always be completed or the user must re-authorize
          if (!open && !selectingPage && pageSelectSource === "exchange") setShowPageSelector(open);
        }}
      >
        <DialogContent className="max-w-md" onInteractOutside={e => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Instagram className="w-5 h-5 text-pink-500" />
              Elige cuál Página de Facebook conectar
            </DialogTitle>
            <DialogDescription>
              {pageSelectSource === "oauth"
                ? "Debes seleccionar la Página correcta para completar la autorización. Elige la Página de Facebook de tu negocio."
                : "Tu cuenta administra varias páginas. Elige cuál usar para este negocio."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {pageSelectOptions.map((p: { id: string; name: string; igUsername?: string; hasInstagram?: boolean }) => (
              <button
                key={p.id}
                disabled={selectingPage}
                onClick={() => handlePageSelect(p.id)}
                className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed group ${
                  p.igUsername
                    ? "border-pink-500/30 bg-pink-950/10 hover:bg-pink-950/20 hover:border-pink-500/50"
                    : "border-blue-500/30 bg-blue-950/10 hover:bg-blue-950/20 hover:border-blue-500/60"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  {p.igUsername
                    ? <p className="text-xs text-pink-400 flex items-center gap-1 mt-0.5"><Instagram className="w-3 h-3" />{p.igUsername}</p>
                    : (
                      <div className="mt-1 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded px-1.5 py-0.5">
                            ✓ Conectar con Facebook
                          </span>
                          <span className="text-[10px] text-amber-400 font-medium">· Instagram no vinculado</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug">
                          Publica en <strong className="text-foreground">Facebook</strong> de inmediato. Para Instagram: ve a Meta Business Suite → tu Página → Configuración → Instagram y vincula la cuenta, luego vuelve a autorizar aquí.
                        </p>
                      </div>
                    )
                  }
                </div>
                <div className="shrink-0 ml-2">
                  {selectingPage
                    ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    : <CheckCircle2 className={`w-5 h-5 transition-colors ${p.igUsername ? "text-muted-foreground group-hover:text-pink-400" : "text-blue-400/60 group-hover:text-blue-400"}`} />
                  }
                </div>
              </button>
            ))}
          </div>
          <DialogFooter className="flex-col gap-2">
            {pageSelectSource === "exchange" && (
              <Button variant="outline" onClick={() => setShowPageSelector(false)} disabled={selectingPage} className="w-full">
                Cancelar
              </Button>
            )}
            {pageSelectSource === "oauth" && (
              <p className="text-xs text-muted-foreground text-center">
                Si no ves tu página, verifica que seas <strong>administrador</strong> de ella en Facebook.
              </p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ─── 2FA / Google Authenticator Section ──────────────────────────────────────
type TotpStep = "idle" | "setup" | "disable";

interface TrustedDevice {
  id: number;
  deviceName: string | null;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

function TwoFactorSettings() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [step, setStep] = useState<TotpStep>("idle");
  const [secret, setSecret] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  async function loadStatus() {
    try {
      const res = await fetch(`${BASE}/api/auth/totp/status`, { credentials: "include" });
      const data = await res.json();
      setEnabled(data.enabled);
    } catch {}
  }

  async function loadDevices() {
    setDevicesLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/totp/devices`, { credentials: "include" });
      const data = await res.json();
      setDevices(Array.isArray(data) ? data : []);
    } catch {} finally {
      setDevicesLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
    loadDevices();
  }, []);

  async function startSetup() {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/totp/setup`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSecret(data.secret);
      setQrCodeDataUrl(data.qrCodeDataUrl);
      setStep("setup");
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Error al iniciar configuración", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function confirmSetup() {
    if (code.trim().length < 6) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/totp/verify-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "✅ Google Authenticator activado", description: "Este dispositivo ya está en confianza. Solo se pedirá el código desde equipos nuevos." });
      setStep("idle");
      setCode("");
      setEnabled(true);
      loadDevices();
    } catch (err: unknown) {
      toast({ title: "Código incorrecto", description: err instanceof Error ? err.message : "Intenta de nuevo", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function disableTotp() {
    if (code.trim().length < 6) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/totp/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Google Authenticator desactivado", description: "Todos los dispositivos de confianza fueron eliminados." });
      setStep("idle");
      setCode("");
      setEnabled(false);
      setDevices([]);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Código incorrecto", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function revokeDevice(id: number) {
    setRevokingId(id);
    try {
      await fetch(`${BASE}/api/auth/totp/devices/${id}`, { method: "DELETE", credentials: "include" });
      setDevices(prev => prev.filter(d => d.id !== id));
      toast({ title: "Dispositivo eliminado" });
    } catch {
      toast({ title: "Error al eliminar dispositivo", variant: "destructive" });
    } finally {
      setRevokingId(null);
    }
  }

  async function revokeAllDevices() {
    setLoading(true);
    try {
      await fetch(`${BASE}/api/auth/totp/devices`, { method: "DELETE", credentials: "include" });
      setDevices([]);
      toast({ title: "Todos los dispositivos eliminados", description: "Se pedirá el código 2FA en el próximo inicio de sesión." });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "ahora mismo";
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h}h`;
    const d = Math.floor(h / 24);
    return `hace ${d} día${d > 1 ? "s" : ""}`;
  }

  return (
    <Card className="bg-card/80 border-border/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Seguridad — Verificación en dos pasos (2FA)</CardTitle>
          </div>
          {enabled !== null && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${enabled ? "bg-green-500/15 text-green-400 border-green-500/30" : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"}`}>
              {enabled ? "✓ Activado" : "Desactivado"}
            </span>
          )}
        </div>
        <CardDescription>
          Completamente opcional. Si lo activas, se pedirá el código de Google Authenticator solo cuando entres desde un dispositivo desconocido.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {enabled === null ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            Cargando…
          </div>
        ) : step === "idle" ? (
          <div className="space-y-4">
            {enabled ? (
              <>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                  <ShieldCheck className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-green-400">Verificación en dos pasos activa</p>
                    <p className="text-xs text-muted-foreground">Solo se pedirá el código desde dispositivos nuevos o desconocidos. Los equipos de confianza entran directo.</p>
                  </div>
                </div>

                {/* Trusted devices */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Dispositivos de confianza</p>
                    {devices.length > 1 && (
                      <button onClick={revokeAllDevices} disabled={loading} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                        Eliminar todos
                      </button>
                    )}
                  </div>

                  {devicesLoading ? (
                    <p className="text-xs text-muted-foreground">Cargando dispositivos…</p>
                  ) : devices.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Ningún dispositivo de confianza. Se pedirá el código en el próximo login.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {devices.map(d => (
                        <div key={d.id} className="flex items-center justify-between p-2.5 rounded-lg bg-background/40 border border-border/50">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${d.isCurrent ? "bg-green-400" : "bg-zinc-500"}`} />
                            <div>
                              <p className="text-xs font-medium text-foreground">
                                {d.deviceName ?? "Dispositivo desconocido"}
                                {d.isCurrent && <span className="ml-1.5 text-green-400">(este equipo)</span>}
                              </p>
                              <p className="text-xs text-muted-foreground">Último acceso: {timeAgo(d.lastUsedAt)}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => revokeDevice(d.id)}
                            disabled={revokingId === d.id}
                            className="text-xs text-muted-foreground hover:text-red-400 transition-colors px-2 py-1"
                          >
                            {revokingId === d.id ? "…" : "Eliminar"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button variant="outline" size="sm" onClick={() => { setCode(""); setStep("disable"); }} className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50">
                  Desactivar Google Authenticator
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-400">2FA no activado (opcional)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Si lo activas, se pedirá el código solo desde equipos nuevos. En equipos de confianza entras directo con email y contraseña.</p>
                  </div>
                </div>
                <Button size="sm" onClick={startSetup} disabled={loading} className="bg-primary hover:bg-primary/90">
                  {loading ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Generando…</> : "Activar Google Authenticator"}
                </Button>
              </>
            )}
          </div>
        ) : step === "setup" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escanea este QR con <strong className="text-foreground">Google Authenticator</strong> (o Authy). Solo necesitarás el código desde equipos nuevos.
            </p>

            {qrCodeDataUrl && (
              <div className="flex justify-center">
                <div className="p-3 bg-white rounded-xl inline-block shadow-lg">
                  <img src={qrCodeDataUrl} alt="QR Code 2FA" className="w-44 h-44" />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground text-center">¿No puedes escanear? Ingresa este código manualmente en la app:</p>
              <div className="flex items-center gap-2 bg-background/50 border border-border rounded-lg px-3 py-2">
                <code className="flex-1 text-xs font-mono text-primary tracking-widest break-all">{secret}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(secret); toast({ title: "Código copiado" }); }}
                  className="text-muted-foreground hover:text-foreground text-xs shrink-0 border border-border rounded px-2 py-1"
                >
                  Copiar
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <Label className="text-sm">Confirma ingresando el código de 6 dígitos que muestra la app:</Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="text-center text-xl tracking-[0.4em] font-mono h-12"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={confirmSetup} disabled={loading || code.length < 6} className="bg-primary hover:bg-primary/90">
                {loading ? "Verificando…" : "Activar 2FA"}
              </Button>
              <Button variant="outline" onClick={() => { setStep("idle"); setCode(""); setSecret(""); setQrCodeDataUrl(""); }}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : step === "disable" ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <p className="text-sm text-red-400">⚠ Al desactivar 2FA se eliminarán todos los dispositivos de confianza y tu cuenta quedará protegida solo por contraseña.</p>
            </div>
            <div className="space-y-2">
              <Label>Código actual de Google Authenticator para confirmar:</Label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="text-center text-xl tracking-[0.4em] font-mono h-12"
                autoComplete="one-time-code"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={disableTotp} disabled={loading || code.length < 6} className="bg-red-500 hover:bg-red-600 text-white">
                {loading ? "Verificando…" : "Desactivar 2FA"}
              </Button>
              <Button variant="outline" onClick={() => { setStep("idle"); setCode(""); }}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── API Guides Section ───────────────────────────────────────────────────────

function GuideAccordion({
  id,
  icon,
  title,
  status,
  statusLabel,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  status: boolean | null;
  statusLabel?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 bg-black/30 hover:bg-black/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="font-semibold text-sm text-foreground">{title}</span>
          {status === true && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">✅ {statusLabel ?? "Conectado"}</Badge>
          )}
          {status === false && (
            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">⚠️ Sin configurar</Badge>
          )}
          {status === null && (
            <Badge variant="outline" className="text-xs text-muted-foreground">Sin configurar</Badge>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="p-5 bg-black/20 space-y-4 border-t border-border/30">
          {children}
        </div>
      )}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold text-xs">
        {n}
      </div>
      <div className="text-sm text-muted-foreground pt-0.5">{children}</div>
    </div>
  );
}

function ApiGuidesSection({
  igConnected,
  ttConnected,
}: {
  igConnected: boolean | null;
  ttConnected: boolean | null;
}) {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="font-display text-xl text-primary flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          Guías de Configuración de APIs
        </CardTitle>
        <CardDescription>
          Instrucciones paso a paso para conectar Instagram, TikTok y Facebook — escritas para alguien sin experiencia técnica.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Instagram Guide */}
        <GuideAccordion
          id="instagram"
          icon={<Instagram className="w-5 h-5 text-pink-400" />}
          title="Instagram Business API (Meta)"
          status={igConnected}
        >
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-400">
            ⏱ Tiempo estimado: 20–30 minutos. Necesitas acceso a un perfil de Instagram Business y una Página de Facebook.
          </div>

          <div className="space-y-3">
            <Step n={1}>
              <span>Asegúrate de tener una <strong>cuenta de Instagram Business</strong>. En Instagram → Configuración → Cuenta → Cambiar a cuenta profesional.</span>
            </Step>
            <Step n={2}>
              <span>Vincula tu Instagram a una <strong>Página de Facebook</strong>. En Instagram → Configuración → Cuenta → Cuenta vinculada. Si no tienes página, créala en <a href="https://www.facebook.com/pages/create" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">facebook.com/pages/create</a>.</span>
            </Step>
            <Step n={3}>
              <span>Ve al portal de desarrolladores de Meta: <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">developers.facebook.com/apps</a> → Clic en <strong>"Crear app"</strong>.</span>
            </Step>
            <Step n={4}>
              <span>Elige tipo <strong>"Business"</strong> → Ponle un nombre (ej: "hazpost") → Asocia tu cuenta de Facebook → Crear app.</span>
            </Step>
            <Step n={5}>
              <span>En el panel de la app → <strong>"Agregar productos"</strong> → Busca <strong>"Instagram Graph API"</strong> → Clic en Configurar.</span>
            </Step>
            <Step n={6}>
              <span>Ve a Configuración → Básica. Copia el <strong>App ID</strong> y el <strong>App Secret</strong>. Pégalos arriba en "Credenciales de Aplicación".</span>
            </Step>
            <Step n={7}>
              <span>Ve a <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">API Explorer</a> → Selecciona tu app → Genera un token con permisos: <code className="bg-black/50 px-1 rounded">instagram_basic</code>, <code className="bg-black/50 px-1 rounded">instagram_content_publish</code>, <code className="bg-black/50 px-1 rounded">pages_read_engagement</code>.</span>
            </Step>
            <Step n={8}>
              <span>Pega ese token en el campo <strong>"Conexión manual por token"</strong> de arriba y clic en "Guardar token manual". Para un token de larga duración (~60 días), usa el botón "Canjear token".</span>
            </Step>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" asChild>
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Panel Meta Developers
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="https://developers.facebook.com/tools/explorer" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> API Explorer
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="https://business.facebook.com/latest/settings" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Business Settings
              </a>
            </Button>
          </div>

          <a
            href="https://www.youtube.com/results?search_query=instagram+graph+api+meta+developer+tutorial+2024"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 w-full rounded-lg border border-border/30 bg-black/30 hover:bg-black/50 hover:border-border/60 px-4 py-3 transition-all group"
          >
            <span className="text-2xl">▶</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">Ver tutoriales en YouTube</p>
              <p className="text-xs text-muted-foreground">Instagram Graph API · Meta Developer Tutorial</p>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
          </a>
        </GuideAccordion>

        {/* TikTok Guide */}
        <GuideAccordion
          id="tiktok"
          icon={<PlaySquare className="w-5 h-5 text-white" />}
          title="TikTok for Business API"
          status={ttConnected}
        >
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 text-xs text-yellow-400">
            ⚠️ TikTok requiere revisión de tu app por su equipo (puede tardar 3–7 días hábiles). El proceso tiene más pasos que Meta, pero es por una sola vez.
          </div>

          <div className="space-y-3">
            <Step n={1}>
              <span>Ve a <a href="https://developers.tiktok.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">developers.tiktok.com</a> → Inicia sesión con tu cuenta TikTok for Business.</span>
            </Step>
            <Step n={2}>
              <span>Clic en <strong>"Manage Apps"</strong> → <strong>"Create App"</strong> → Completa el nombre, descripción y categoría (Social Media Management).</span>
            </Step>
            <Step n={3}>
              <span>En tu nueva app → Clic en <strong>"Add products"</strong> → Agrega <strong>"Login Kit"</strong> y <strong>"Content Posting API"</strong>.</span>
            </Step>
            <Step n={4}>
              <span>Ve a <strong>App Info</strong> → Copia el <strong>Client Key</strong> y el <strong>Client Secret</strong>. Pégalos arriba en "Credenciales de Aplicación".</span>
            </Step>
            <Step n={5}>
              <span>En la sección <strong>"Redirect URI"</strong> de tu app TikTok, agrega:<br/>
                <code className="bg-black/50 px-2 py-0.5 rounded text-xs block mt-1 break-all">https://41c819f1-5b95-482b-8f91-4916f1bd660b-00-2ja3hkr86oof8.janeway.replit.dev/api/auth/tiktok/callback</code>
              </span>
            </Step>
            <Step n={6}>
              <span>Envía tu app para revisión desde el portal de TikTok. Mientras esperas la aprobación, puedes probar con cuentas de prueba en modo Sandbox.</span>
            </Step>
            <Step n={7}>
              <span>Una vez aprobada, regresa a esta pantalla y clic en <strong>"Autorizar con TikTok"</strong> en la sección de cuentas de arriba.</span>
            </Step>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" asChild>
              <a href="https://developers.tiktok.com/apps/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> TikTok Developers
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="https://business.tiktok.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> TikTok Business Center
              </a>
            </Button>
          </div>
        </GuideAccordion>

        {/* Facebook Guide */}
        <GuideAccordion
          id="facebook"
          icon={<Facebook className="w-5 h-5 text-blue-500" />}
          title="Facebook — Cross-posting automático desde Instagram"
          status={igConnected}
          statusLabel="Conectado vía Instagram"
        >
          <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 text-xs text-green-400">
            ✅ Si Instagram ya está conectado, Facebook NO requiere configuración adicional. El contenido se publica en Facebook automáticamente vía cross-posting de Meta.
          </div>

          <div className="space-y-3">
            <Step n={1}>
              <span>Asegúrate de que tu Instagram Business esté vinculado a una <strong>Página de Facebook</strong> (requisito del paso 2 de Instagram arriba).</span>
            </Step>
            <Step n={2}>
              <span>En la app de Instagram (celular) → Configuración → Cuenta → Publicaciones compartidas → Activa <strong>"Facebook"</strong>. Esto habilita el cross-posting automático.</span>
            </Step>
            <Step n={3}>
              <span>En hazpost, cuando apruebas un post con plataforma "Ambas" (Instagram + Facebook), el sistema publica en Instagram primero y el contenido aparece en Facebook automáticamente sin acción extra.</span>
            </Step>
            <Step n={4}>
              <span>Si ves advertencias de Facebook en el historial de publicaciones, es porque el token no tiene permisos de <code className="bg-black/50 px-1 rounded">pages_manage_posts</code>. Esto es normal — Meta requiere revisión empresarial para ese permiso. El cross-posting funciona sin él.</span>
            </Step>
          </div>

          <Button size="sm" variant="outline" asChild>
            <a href="https://www.facebook.com/help/1148909221857370" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
              <ExternalLink className="w-3 h-3" /> Guía oficial Facebook cross-posting
            </a>
          </Button>
        </GuideAccordion>

      </CardContent>
    </Card>
  );
}
