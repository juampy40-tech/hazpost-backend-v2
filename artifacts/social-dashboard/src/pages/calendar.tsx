import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  FALLBACK_TZ,
  SCHEDULING_TZ,
  hourInTz,
  sameDayInTz,
  localHourToUtcFn,
  nextOptimalHour,
  getTimeLabel,
  formatCalendarDayKey,
  utcHourToBogota,
} from "@/lib/timezone";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  isToday,
  parseISO,
  setHours,
  setMinutes,
  setSeconds,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Grid3x3,
  AlignJustify, GripVertical, X, ExternalLink, Clock, CheckCircle2,
  AlertTriangle, RefreshCw, PlusCircle, CheckSquare, Square,
  Trash2, RotateCcw, CalendarCheck, ChevronDown,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Link, useLocation } from "wouter";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveBusiness } from "@/contexts/ActiveBusinessContext";
import { AIPostingSuggestionsPanel } from "@/components/AIPostingSuggestionsPanel";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ViewMode = "month" | "week";

interface Post {
  id: number;
  postNumber?: number | null;
  businessId?: number | null;
  caption?: string | null;
  status: string;
  platform?: string | null;
  contentType?: string | null;
  scheduledAt?: string | null;
  scheduledAtInstagram?: string | null;
  scheduledAtTiktok?: string | null;
  hashtags?: string | null;
  instagramPostId?: string | null;
  tiktokPostId?: string | null;
}

// A CalendarEntry is a single "slot" in the calendar grid.
// One Post can expand into multiple CalendarEntries when each platform
// has a different scheduled date/time (e.g. IG Wednesday 8pm ≠ TK Wednesday 7pm).
interface CalendarEntry extends Post {
  entryKey: string;        // unique id for React keys and DnD: `${post.id}-ig`, `${post.id}-tk`, etc.
  entryScheduledAt: string; // the date/time for THIS platform entry
  entryPlatform: string;   // 'instagram' | 'tiktok' | 'instagram,tiktok' | original platform
  entryStatus: string;     // effective status for THIS platform leg (accounts for partial publish)
}

/** Expands a flat list of posts into calendar display entries.
 *  Posts with per-platform schedules produce one entry per platform.
 *  Posts with a single scheduledAt produce one entry. */
/** Derives the effective status for a single platform leg.
 *  For "both" posts: shows "published" per platform once its postId is set,
 *  and "failed" when the post was processed but no postId was recorded for that platform.
 *  entryScheduledAt: the platform-specific scheduled time used for past-due detection. */
function platformEntryStatus(post: Post, platform: 'instagram' | 'tiktok' | 'both', entryScheduledAt?: string | null): string {
  if (platform === 'instagram' && post.instagramPostId) return 'published';
  if (platform === 'tiktok' && post.tiktokPostId) return 'published';

  // status='published' is the definitive truth — always green, regardless of which platform IDs are set
  if (post.status === 'published') return 'published';

  // If the post was already processed (not pending/scheduled) but has no confirmation
  // for this platform → that platform's publication failed.
  const wasProcessed = post.status !== 'scheduled'
    && post.status !== 'pending_approval'
    && post.status !== 'pending';
  if (platform === 'instagram' && !post.instagramPostId && wasProcessed) return 'failed';
  if (platform === 'tiktok'    && !post.tiktokPostId    && wasProcessed) return 'failed';

  // Past-due: still scheduled but the planned date has already passed → treat as failed
  if (post.status === 'scheduled' && entryScheduledAt) {
    try { if (parseISO(entryScheduledAt) < new Date()) return 'failed'; } catch { /* ignore bad dates */ }
  }

  return post.status;
}

function expandPostsToEntries(posts: Post[]): CalendarEntry[] {
  const entries: CalendarEntry[] = [];
  for (const post of posts) {
    const ig = post.scheduledAtInstagram ?? null;
    const tk = post.scheduledAtTiktok ?? null;

    if (ig && tk) {
      // Same day AND same minute → merge into one "both-platforms" entry
      const igD = parseISO(ig);
      const tkD = parseISO(tk);
      const sameTime = igD.getTime() === tkD.getTime();
      if (sameTime) {
        entries.push({ ...post, entryKey: `${post.id}-both`, entryScheduledAt: ig, entryPlatform: 'instagram,tiktok', entryStatus: platformEntryStatus(post, 'both', ig) });
      } else {
        entries.push({ ...post, entryKey: `${post.id}-ig`, entryScheduledAt: ig, entryPlatform: 'instagram', entryStatus: platformEntryStatus(post, 'instagram', ig) });
        entries.push({ ...post, entryKey: `${post.id}-tk`, entryScheduledAt: tk, entryPlatform: 'tiktok', entryStatus: platformEntryStatus(post, 'tiktok', tk) });
      }
    } else if (ig) {
      entries.push({ ...post, entryKey: `${post.id}-ig`, entryScheduledAt: ig, entryPlatform: 'instagram', entryStatus: platformEntryStatus(post, 'instagram', ig) });
    } else if (tk) {
      entries.push({ ...post, entryKey: `${post.id}-tk`, entryScheduledAt: tk, entryPlatform: 'tiktok', entryStatus: platformEntryStatus(post, 'tiktok', tk) });
    } else if (post.scheduledAt) {
      if (post.platform === 'both') {
        entries.push({ ...post, entryKey: `${post.id}-ig`, entryScheduledAt: post.scheduledAt, entryPlatform: 'instagram', entryStatus: platformEntryStatus(post, 'instagram', post.scheduledAt) });
        entries.push({ ...post, entryKey: `${post.id}-tk`, entryScheduledAt: post.scheduledAt, entryPlatform: 'tiktok', entryStatus: platformEntryStatus(post, 'tiktok', post.scheduledAt) });
      } else {
        entries.push({ ...post, entryKey: `${post.id}`, entryScheduledAt: post.scheduledAt, entryPlatform: post.platform ?? '', entryStatus: platformEntryStatus(post, (post.platform as 'instagram' | 'tiktok') ?? 'instagram', post.scheduledAt) });
      }
    }
  }
  return entries;
}


function getStatusColor(status: string) {
  switch (status) {
    case 'published':        return 'bg-emerald-500/90 text-white border-emerald-400/60';
    case 'scheduled':        return 'bg-secondary/80 text-secondary-foreground border-secondary/50';
    case 'pending_approval': return 'bg-amber-400/90 text-amber-950 border-amber-400/50';
    case 'pending':          return 'bg-amber-400/90 text-amber-950 border-amber-400/50';
    case 'rejected':         return 'bg-destructive/80 text-destructive-foreground border-destructive/50';
    case 'failed':           return 'bg-red-500/80 text-white border-red-400/60';
    default:                 return 'bg-muted text-muted-foreground border-white/10';
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'published':        return 'Publicado';
    case 'scheduled':        return 'Programado';
    case 'pending_approval': return 'Pendiente de aprobación';
    case 'rejected':         return 'Rechazado';
    case 'failed':           return 'Error al publicar';
    default:                 return status;
  }
}

function getPlatformLabel(platform: string | null | undefined) {
  if (platform === 'instagram') return 'IG';
  if (platform === 'tiktok') return 'TK';
  if (platform === 'facebook') return 'FB';
  return 'IG+TK';
}

function getContentTypeBadge(contentType: string | null | undefined): { icon: string; label: string } {
  if (contentType === 'reel')     return { icon: '🎬', label: 'Reel'     };
  if (contentType === 'carousel') return { icon: '🎠', label: 'Carrusel' };
  if (contentType === 'story')    return { icon: '📖', label: 'Historia' };
  if (contentType === 'video')    return { icon: '🎥', label: 'Video'    };
  return { icon: '📷', label: 'Foto' };
}


// ─── Hora options helper ──────────────────────────────────────────────────────
const HOUR_OPTIONS = [
  { value: 7,  label: "7:00 AM" },
  { value: 8,  label: "8:00 AM" },
  { value: 9,  label: "9:00 AM" },
  { value: 10, label: "10:00 AM" },
  { value: 11, label: "11:00 AM" },
  { value: 12, label: "12:00 PM" },
  { value: 13, label: "1:00 PM" },
  { value: 14, label: "2:00 PM" },
  { value: 15, label: "3:00 PM" },
  { value: 16, label: "4:00 PM" },
  { value: 17, label: "5:00 PM" },
  { value: 18, label: "6:00 PM" },
  { value: 19, label: "7:00 PM" },
  { value: 20, label: "8:00 PM" },
];

// ─── Post detail popup ────────────────────────────────────────────────────────
function PostPopup({ post, onClose, onRescheduleToday, onRescheduleToDate }: {
  post: Post;
  onClose: () => void;
  onRescheduleToday: (post: Post) => void;
  onRescheduleToDate: (post: Post, payload: { date: string; igHour?: number; tkHour?: number; allHour?: number }, onDone?: () => void) => void;
}) {
  const [, navigate] = useLocation();
  const [showPicker, setShowPicker] = useState(false);
  const [pickedDate, setPickedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [markingPublished, setMarkingPublished] = useState(false);
  const queryClient = useQueryClient();

  async function handleMarkPublished() {
    setMarkingPublished(true);
    try {
      const res = await fetch(`${BASE}/api/posts/${post.id}/mark-published`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert((data as { error?: string }).error ?? "Error al marcar como publicado");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
      onClose();
    } finally {
      setMarkingPublished(false);
    }
  }

  // Detect multi-platform with independent schedules
  const isBoth = post.platform === 'both' || (post.scheduledAtInstagram && post.scheduledAtTiktok);

  const igDate  = post.scheduledAtInstagram ?? post.scheduledAt ?? null;
  const tkDate  = post.scheduledAtTiktok    ?? post.scheduledAt ?? null;

  const defaultIgHour = igDate ? utcHourToBogota(igDate) : 12;
  const defaultTkHour = tkDate ? utcHourToBogota(tkDate) : 19;

  const [pickedIgHour, setPickedIgHour] = useState(defaultIgHour);
  const [pickedTkHour, setPickedTkHour] = useState(defaultTkHour);
  const [pickedHour,   setPickedHour]   = useState(defaultIgHour);

  const scheduledDate       = post.scheduledAt ? parseISO(post.scheduledAt) : null;
  const isPublished         = post.status === 'published';
  const isScheduled         = post.status === 'scheduled';
  const isPendingOrRejected = post.status === 'pending_approval' || post.status === 'rejected';
  const canReschedule       = !isPublished;
  // Per-platform published flags (for "both" posts partially published or partially failed)
  const igPublished = !!post.instagramPostId;
  const tkPublished = !!post.tiktokPostId;
  const wasProcessed = post.status !== 'scheduled' && post.status !== 'pending_approval' && post.status !== 'pending';
  // status='published' is the definitive truth — never show per-platform failures on a published post
  const igFailed = isBoth && !igPublished && wasProcessed && post.status !== 'published';
  const tkFailed = isBoth && !tkPublished && wasProcessed && post.status !== 'published';
  // Past-due: still scheduled but the planned date has already passed
  const isPastDue = post.status === 'scheduled' && scheduledDate !== null && scheduledDate < new Date();
  // Show per-platform badges when partially published OR when there is a partial/full failure on a "both" post
  const isPartiallyPublished = isBoth && (igPublished || tkPublished || igFailed || tkFailed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm bg-card border border-border/60 rounded-2xl shadow-2xl p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {isPartiallyPublished ? (
              <>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${igPublished ? getStatusColor('published') : igFailed ? getStatusColor('failed') : getStatusColor(post.status)}`}>
                  IG {igPublished ? '✓' : igFailed ? '✗' : getStatusLabel(post.status)}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${tkPublished ? getStatusColor('published') : tkFailed ? getStatusColor('failed') : getStatusColor(post.status)}`}>
                  TK {tkPublished ? '✓' : tkFailed ? '✗' : getStatusLabel(post.status)}
                </span>
              </>
            ) : (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusColor(post.status)}`}>
                {getStatusLabel(post.status)}
              </span>
            )}
            <span className="text-[10px] font-mono bg-white/10 border border-white/20 text-white/60 px-1.5 py-0.5 rounded-full">
              #{post.postNumber ?? post.id}
            </span>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">
              {getPlatformLabel(post.platform)} · {post.contentType}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Caption preview */}
        <p className="text-sm leading-relaxed text-foreground/90 line-clamp-4">
          {post.caption || <span className="text-muted-foreground italic">Sin caption</span>}
        </p>

        {/* Per-platform scheduled times */}
        {isBoth && (igDate || tkDate) ? (
          <div className="space-y-1.5">
            {igDate && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-black/30 rounded-lg px-3 py-2">
                <span className="text-[10px] font-bold text-[#E1306C]">IG</span>
                <span>{format(parseISO(igDate), "EEE d MMM · HH:mm", { locale: es })}</span>
              </div>
            )}
            {tkDate && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-black/30 rounded-lg px-3 py-2">
                <span className="text-[10px] font-bold text-[#69C9D0]">TK</span>
                <span>{format(parseISO(tkDate), "EEE d MMM · HH:mm", { locale: es })}</span>
              </div>
            )}
          </div>
        ) : scheduledDate ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-black/30 rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5 text-secondary" />
            <span>{format(scheduledDate, "EEEE d 'de' MMMM · HH:mm", { locale: es })}</span>
          </div>
        ) : null}

        {/* Error notice — visible when a post failed, a platform leg failed, or the date passed without publishing */}
        {(post.status === 'failed' || igFailed || tkFailed || isPastDue) && (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {isPastDue && !igFailed && !tkFailed
                  ? 'La fecha de publicación ya pasó y el post no fue publicado. Si lo publicaste a mano, márcalo como publicado.'
                  : igFailed || tkFailed
                    ? `Error al publicar en ${[igFailed ? 'Instagram' : '', tkFailed ? 'TikTok' : ''].filter(Boolean).join(' y ')}. Si lo publicaste a mano, márcalo como publicado.`
                    : 'No se pudo publicar automáticamente. Si lo publicaste a mano, márcalo como publicado.'}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={markingPublished}
              onClick={handleMarkPublished}
              className="w-full border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {markingPublished ? 'Marcando...' : 'Lo publiqué a mano — marcar como publicado'}
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-1">

          {/* Reschedule to another date — inline date picker */}
          {canReschedule && (
            <div className="space-y-2">
              <Button
                onClick={() => setShowPicker(v => !v)}
                className="w-full bg-white/5 hover:bg-white/10 text-foreground border border-border/50 gap-2"
                variant="outline"
              >
                <CalendarIcon className="w-4 h-4 text-primary" />
                {showPicker ? 'Cancelar' : 'Reprogramar para otro día'}
              </Button>
              {showPicker && (
                <div className="bg-black/40 border border-border/40 rounded-xl p-3 space-y-3">
                  {/* Date picker — shared for all platforms */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground uppercase font-semibold tracking-widest">Fecha</label>
                    <input
                      type="date"
                      value={pickedDate}
                      onChange={e => setPickedDate(e.target.value)}
                      className="w-full bg-black/40 border border-border/50 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60"
                    />
                  </div>

                  {/* Per-platform hour pickers when post has both platforms */}
                  {isBoth ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold tracking-widest flex items-center gap-1.5">
                          <span className="text-[#E1306C]">IG</span>
                          <span className="text-muted-foreground uppercase">Hora Instagram (Bogotá)</span>
                        </label>
                        <select
                          value={pickedIgHour}
                          onChange={e => setPickedIgHour(Number(e.target.value))}
                          className="w-full bg-black/40 border border-border/50 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60"
                        >
                          {HOUR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold tracking-widest flex items-center gap-1.5">
                          <span className="text-[#69C9D0]">TK</span>
                          <span className="text-muted-foreground uppercase">Hora TikTok (Bogotá)</span>
                        </label>
                        <select
                          value={pickedTkHour}
                          onChange={e => setPickedTkHour(Number(e.target.value))}
                          className="w-full bg-black/40 border border-border/50 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60"
                        >
                          {HOUR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground uppercase font-semibold tracking-widest">Hora (Bogotá)</label>
                      <select
                        value={pickedHour}
                        onChange={e => setPickedHour(Number(e.target.value))}
                        className="w-full bg-black/40 border border-border/50 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/60"
                      >
                        {HOUR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  )}

                  <Button
                    onClick={() => {
                      onRescheduleToDate(
                        post,
                        isBoth
                          ? { date: pickedDate, igHour: pickedIgHour, tkHour: pickedTkHour }
                          : { date: pickedDate, allHour: pickedHour },
                        onClose
                      );
                    }}
                    disabled={!pickedDate}
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Confirmar reprogramación
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Publish today — for any non-published post */}
          {canReschedule && (
            <Button
              onClick={() => { onRescheduleToday(post); onClose(); }}
              className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 gap-2"
              variant="outline"
            >
              <CheckCircle2 className="w-4 h-4" />
              Programar para hoy
            </Button>
          )}

          {/* Review/edit scheduled posts */}
          {isScheduled && (
            <Button
              onClick={() => { navigate(`/approval?post=${post.id}`); onClose(); }}
              className="w-full bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/30 gap-2"
              variant="outline"
            >
              <ExternalLink className="w-4 h-4" />
              Revisar, editar o eliminar
            </Button>
          )}

          {/* Go to approval — for pending or rejected */}
          {isPendingOrRejected && (
            <Button
              onClick={() => { navigate(`/approval?post=${post.id}`); onClose(); }}
              className="w-full bg-amber-400/10 hover:bg-amber-400/20 text-amber-400 border border-amber-400/30 gap-2"
              variant="outline"
            >
              <ExternalLink className="w-4 h-4" />
              {post.status === 'rejected' ? 'Revisar y re-aprobar' : 'Ir a aprobación'}
            </Button>
          )}

          {/* View published post */}
          {isPublished && (
            <Button
              onClick={() => { navigate(`/history`); onClose(); }}
              className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 gap-2"
              variant="outline"
            >
              <ExternalLink className="w-4 h-4" />
              Ver en historial
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Draggable post chip ──────────────────────────────────────────────────────
function PostChipContent({ post, compact = false, hasNoAccounts = false }: { post: CalendarEntry; compact?: boolean; hasNoAccounts?: boolean }) {
  const { icon } = getContentTypeBadge(post.contentType);
  const time = getTimeLabel(post.entryScheduledAt);
  const platform = getPlatformLabel(post.entryPlatform);
  const caption = (post.caption ?? '').substring(0, compact ? 18 : 24);

  return (
    <div className="flex flex-col gap-0.5 w-full overflow-hidden">
      {/* Row 1: time · type icon · platform */}
      <div className="flex items-center gap-1 flex-wrap">
        {time && (
          <span className="font-bold opacity-90 shrink-0 text-[9px]">⏰{time}</span>
        )}
        <span className="shrink-0 text-[10px]">{icon}</span>
        <span className="text-[8px] opacity-60 shrink-0">· {platform}</span>
        <span className="text-[8px] opacity-50 ml-auto shrink-0">#{post.postNumber ?? post.id}</span>
        {hasNoAccounts && (
          <Popover>
            <PopoverTrigger asChild>
              <span
                className="shrink-0 cursor-pointer"
                onClick={e => e.stopPropagation()}
              >
                <AlertTriangle className="w-2.5 h-2.5 text-yellow-400" />
              </span>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 text-xs" side="top" onClick={e => e.stopPropagation()}>
              <p className="font-medium text-yellow-400 mb-1">Sin cuentas conectadas</p>
              <p className="text-muted-foreground leading-snug mb-2">
                Este negocio no publicará automáticamente. Conecta Instagram o TikTok para activar la publicación.
              </p>
              <Link href="/settings" className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">
                Ir a Configuración → Cuentas Sociales
              </Link>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {/* Row 2: caption preview */}
      <div className="truncate text-[9px] opacity-80 leading-tight">{caption || <span className="opacity-40 italic">sin texto</span>}</div>
    </div>
  );
}

function DraggablePost({ post, onOpen, bulkMode, isSelected, onToggleSelect, hasNoAccounts }: {
  post: CalendarEntry;
  onOpen: (p: Post) => void;
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: number) => void;
  hasNoAccounts?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `post-${post.entryKey}`,
    data: { post },
    disabled: bulkMode,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.3 : 1 }
    : undefined;

  const canDrag = post.entryStatus !== 'published';
  const colorClass = getStatusColor(post.entryStatus);

  const handleClick = () => {
    if (bulkMode) {
      onToggleSelect?.(post.id);
    } else {
      onOpen(post);
    }
  };

  if (!canDrag) {
    return (
      <div
        onClick={handleClick}
        className={`text-[10px] px-1.5 py-1 rounded-md cursor-pointer border hover:opacity-80 transition-opacity ${colorClass} ${isSelected ? 'ring-2 ring-primary' : ''}`}
      >
        <div className="flex items-start gap-1">
          {bulkMode && (
            <span className="shrink-0 mt-0.5">
              {isSelected ? <CheckSquare className="w-3 h-3 text-primary" /> : <Square className="w-3 h-3 opacity-50" />}
            </span>
          )}
          <PostChipContent post={post} hasNoAccounts={hasNoAccounts} />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleClick}
      className={`text-[10px] px-1.5 py-1 rounded-md border flex items-start gap-1 group transition-all ${colorClass} ${isDragging ? 'opacity-30' : 'hover:opacity-80'} ${isSelected ? 'ring-2 ring-primary' : ''}`}
    >
      {bulkMode ? (
        <span className="shrink-0 mt-0.5">
          {isSelected ? <CheckSquare className="w-3 h-3 text-primary" /> : <Square className="w-3 h-3 opacity-50" />}
        </span>
      ) : (
        <span
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-60 transition-opacity mt-0.5"
          title="Arrastra para reprogramar"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="w-2.5 h-2.5" />
        </span>
      )}
      <div className="flex-1 overflow-hidden">
        <PostChipContent post={post} hasNoAccounts={hasNoAccounts} />
      </div>
    </div>
  );
}

function PostDragOverlay({ post }: { post: CalendarEntry }) {
  const colorClass = getStatusColor(post.entryStatus);
  return (
    <div className={`text-[10px] px-1.5 py-1 rounded-md border shadow-2xl cursor-grabbing rotate-2 scale-105 min-w-[140px] ${colorClass}`}>
      <PostChipContent post={post} />
    </div>
  );
}

// ─── Droppable cells ──────────────────────────────────────────────────────────
function DroppableDay({ date, children, isCurrentDay, isOver }: {
  date: Date; children: React.ReactNode; isCurrentDay: boolean; isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: formatCalendarDayKey(date) });
  return (
    <div
      ref={setNodeRef}
      className={`group border-r border-b border-border/20 p-2 flex flex-col gap-1 transition-colors relative min-h-[32px]
        ${isCurrentDay ? 'bg-primary/5' : ''}
        ${isOver ? 'bg-primary/10 ring-1 ring-primary/40 ring-inset' : 'hover:bg-white/5'}`}
    >
      {isCurrentDay && <div className="absolute top-0 left-0 w-full h-0.5 bg-primary shadow-[0_0_8px_rgba(0,119,255,0.8)]" />}
      {children}
    </div>
  );
}

function DroppableWeekCell({ date, hour, children, isCurrentDay, isOver }: {
  date: Date; hour: number; children: React.ReactNode; isCurrentDay: boolean; isOver: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `${formatCalendarDayKey(date)}_${hour}` });
  return (
    <div
      ref={setNodeRef}
      className={`p-2 border-r border-border/20 last:border-0 space-y-1 transition-colors
        ${isCurrentDay ? 'bg-primary/5' : ''}
        ${isOver ? 'bg-primary/10 ring-1 ring-primary/40 ring-inset' : ''}`}
    >
      {children}
    </div>
  );
}


/** Format a 24h hour number as 12h AM/PM label */
function formatHour12(h: number): string {
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${suffix}`;
}

interface UserBusiness { id: number; name?: string | null; isDefault?: boolean; }
// null = sin resolver (esperando cargar negocios); "all" = todos; number = negocio específico
type CalendarBizScope = "all" | number | null;

// ─── Main Calendar ────────────────────────────────────────────────────────────
export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [activePost, setActivePost] = useState<CalendarEntry | null>(null);
  const [overDropId, setOverDropId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [calendarBizScope, setCalendarBizScope] = useState<CalendarBizScope>(null);
  const scopeInitialized = useRef(false);
  const lastUserId = useRef<number | null>(null);

  const { user } = useAuth();
  const userTz = user?.timezone ?? FALLBACK_TZ;
  const { id: globalBizId, loaded: bizContextLoaded } = useActiveBusiness();

  const [socialAccounts, setSocialAccounts] = useState<Array<{ id: number; platform: string; username: string | null; businessId: number | null; connected?: string }>>([]);
  const [socialAccountsLoaded, setSocialAccountsLoaded] = useState(false);

  useEffect(() => {
    const refetch = () => {
      fetch(`${BASE}/api/social-accounts`, { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then((d: unknown) => {
          if (Array.isArray(d)) setSocialAccounts(d);
          else if (d !== null && typeof d === "object" && Array.isArray((d as Record<string, unknown>).accounts)) {
            setSocialAccounts((d as Record<string, unknown>).accounts as typeof socialAccounts);
          }
          setSocialAccountsLoaded(true);
        })
        .catch(() => { setSocialAccountsLoaded(true); });
    };
    refetch();
    const onVisible = () => { if (!document.hidden) refetch(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ── Reset initialization when the logged-in user changes (account switch without remount) ──
  useEffect(() => {
    const userId = user?.id ?? null;
    if (lastUserId.current !== null && lastUserId.current !== userId) {
      scopeInitialized.current = false;
      setCalendarBizScope(null);
    }
    lastUserId.current = userId;
  }, [user?.id]);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Bulk selection ──
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<number>>(new Set());
  const [bulkConfirmAction, setBulkConfirmAction] = useState<"delete" | "pending" | "scheduled" | null>(null);

  const toggleBulkMode = () => {
    setBulkMode(m => !m);
    setSelectedPostIds(new Set());
  };
  const toggleSelectPost = (id: number) => {
    setSelectedPostIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => {
    const visible = posts.filter(p => {
      if (!p.scheduledAt) return true;
      const d = parseISO(p.scheduledAt);
      return d >= startOfMonth(currentDate) && d <= endOfMonth(currentDate);
    });
    setSelectedPostIds(new Set(visible.map(p => p.id)));
  };

  const bulkDelete = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id =>
        fetch(`${BASE}/api/posts/${id}`, { method: "DELETE", credentials: "include" })
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
      setSelectedPostIds(new Set());
      setBulkMode(false);
      setBulkConfirmAction(null);
    },
  });

  const bulkUpdateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      await Promise.all(ids.map(id =>
        fetch(`${BASE}/api/posts/${id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        })
      ));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
      setSelectedPostIds(new Set());
      setBulkMode(false);
      setBulkConfirmAction(null);
    },
  });

  const handleBulkConfirm = () => {
    const ids = Array.from(selectedPostIds);
    if (!bulkConfirmAction || ids.length === 0) return;
    if (bulkConfirmAction === "delete") {
      bulkDelete.mutate(ids);
    } else if (bulkConfirmAction === "pending") {
      bulkUpdateStatus.mutate({ ids, status: "pending_approval" });
    } else if (bulkConfirmAction === "scheduled") {
      bulkUpdateStatus.mutate({ ids, status: "scheduled" });
    }
  };

  const bulkActionLabel = bulkConfirmAction === "delete"
    ? `¿Eliminar ${selectedPostIds.size} post${selectedPostIds.size !== 1 ? "s" : ""}?`
    : bulkConfirmAction === "pending"
    ? `¿Mover ${selectedPostIds.size} post${selectedPostIds.size !== 1 ? "s" : ""} a Pendiente?`
    : `¿Marcar ${selectedPostIds.size} post${selectedPostIds.size !== 1 ? "s" : ""} como Programados?`;

  const bulkActionDescription = bulkConfirmAction === "delete"
    ? "Esta acción no se puede deshacer. Los posts eliminados no podrán recuperarse."
    : bulkConfirmAction === "pending"
    ? "Los posts seleccionados regresarán al estado de pendiente de aprobación."
    : "Los posts seleccionados se marcarán como programados y se publicarán en su fecha.";

  // ── Fetch the current user's own businesses for the calendar business filter ──
  const { data: userBusinesses = [] } = useQuery<UserBusiness[]>({
    queryKey: ["calendar-user-businesses"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/businesses`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.businesses ?? [];
    },
    staleTime: 60_000,
  });

  // ── Initialize scope to the default business once on first load ──
  // Uses a ref guard so the user's manual selections are never overwritten.
  // Waits for bizContextLoaded so globalBizId is available before choosing the initial scope.
  // Restores the last selection from localStorage (keyed by user id) when available.
  useEffect(() => {
    if (scopeInitialized.current || userBusinesses.length === 0 || !user || !bizContextLoaded) return;

    const storageKey = `hz_cal_scope_${user.id}`;
    const saved = localStorage.getItem(storageKey);

    if (saved !== null) {
      if (saved === "all") {
        setCalendarBizScope("all");
      } else {
        const savedId = Number(saved);
        if (!isNaN(savedId) && userBusinesses.some(b => b.id === savedId)) {
          setCalendarBizScope(savedId);
        } else {
          // Saved business no longer exists — fall back to global active business
          const defaultBiz = (globalBizId ? userBusinesses.find(b => b.id === globalBizId) : null) ?? userBusinesses.find(b => b.isDefault) ?? userBusinesses[0];
          setCalendarBizScope(userBusinesses.length > 1 ? defaultBiz.id : "all");
        }
      }
    } else {
      // V-CAL: No saved preference — default to the global active business (not "all negocios").
      // This prevents showing posts from multiple businesses mixed together on first load.
      // The user can explicitly switch to "Todos" using the scope selector.
      if (userBusinesses.length > 1) {
        const defaultBiz = (globalBizId ? userBusinesses.find(b => b.id === globalBizId) : null) ?? userBusinesses.find(b => b.isDefault) ?? userBusinesses[0];
        setCalendarBizScope(defaultBiz.id);
      } else {
        // Single-business accounts: "all" is semantically equivalent to their only business.
        setCalendarBizScope("all");
      }
    }

    scopeInitialized.current = true;
  }, [userBusinesses, user, bizContextLoaded, globalBizId]);

  // ── Persist the current scope selection to localStorage whenever it changes ──
  useEffect(() => {
    if (!scopeInitialized.current || !user || calendarBizScope === null) return;
    const storageKey = `hz_cal_scope_${user.id}`;
    localStorage.setItem(storageKey, String(calendarBizScope));
  }, [calendarBizScope, user]);

  // ── Build the API query string based on business scope selection ──
  // Only called when calendarBizScope !== null (query is disabled otherwise).
  function buildPostsUrl() {
    const params = new URLSearchParams({ slim: "1" });
    if (calendarBizScope === "all") {
      params.set("allBusinesses", "1");
    } else if (calendarBizScope !== null) {
      params.set("businessId", String(calendarBizScope));
    }
    return `${BASE}/api/posts?${params}`;
  }

  // ── Slim fetch — no base64 images, loads fast ──
  // Rejected posts are excluded from the calendar (they were not approved)
  const { data: allPosts = [], isLoading } = useQuery<Post[]>({
    queryKey: ["calendar-posts", calendarBizScope],
    queryFn: async () => {
      const res = await fetch(buildPostsUrl(), { credentials: "include" });
      if (!res.ok) throw new Error("Error cargando posts");
      return res.json();
    },
    refetchInterval: 30_000,
    enabled: calendarBizScope !== null,
  });
  const posts = allPosts.filter(p => p.status !== 'rejected');

  // Expand each post into 1-2 CalendarEntries (one per platform when scheduled times differ)
  const calendarEntries = useMemo(() => expandPostsToEntries(posts), [posts]);

  // ── Block-day mutation (mark as manually published) ──
  const [blockingDate, setBlockingDate] = useState<string | null>(null);
  const blockDay = useMutation({
    mutationFn: async (dateStr: string) => {
      const res = await fetch(`${BASE}/api/posts/block-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr, platform: "both" }),
      });
      if (!res.ok) throw new Error("Error al marcar el día");
      return res.json();
    },
    onSuccess: () => {
      setBlockingDate(null);
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
    },
    onError: () => setBlockingDate(null),
  });

  // ── Reschedule mutation ──
  const reschedule = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => {
      const res = await fetch(`${BASE}/api/posts/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("No se pudo reprogramar");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar-posts"] }),
    onError: () => toast({ title: "Error al reprogramar", description: "No se pudo cambiar el horario. Intenta de nuevo.", variant: "destructive" }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const weekStart  = startOfWeek(currentDate,  { weekStartsOn: 0 });
  const weekEnd    = endOfWeek(currentDate,    { weekStartsOn: 0 });
  const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Dynamic hour slots for week view: all unique Bogotá hours present in the current week.
  // Uses fixed America/Bogota to match backend bogotaDayKey — falls back to [7,12,19] when no posts.
  const weekHourSlots = useMemo(() => {
    const weekEntries = calendarEntries.filter(entry => {
      const d = new Date(entry.entryScheduledAt);
      return daysInWeek.some(day => sameDayInTz(d, day, SCHEDULING_TZ));
    });
    if (weekEntries.length === 0) return [7, 12, 19];
    const hours = new Set(weekEntries.map(e => hourInTz(e.entryScheduledAt, SCHEDULING_TZ)));
    return Array.from(hours).sort((a, b) => a - b);
  }, [calendarEntries, weekStart.toISOString()]);

  const navigatePrev = () => viewMode === "month"
    ? setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    : setCurrentDate(subWeeks(currentDate, 1));

  const navigateNext = () => viewMode === "month"
    ? setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    : setCurrentDate(addWeeks(currentDate, 1));

  const getPostsForDay = useCallback((date: Date) => {
    return calendarEntries.filter(entry => {
      const d = new Date(entry.entryScheduledAt);
      // Use fixed America/Bogota to match backend bogotaDayKey — all scheduling is Bogotá-based
      return sameDayInTz(d, date, SCHEDULING_TZ);
    });
  }, [calendarEntries]);

  const handleDragStart = (e: DragStartEvent) => {
    const entry = e.active.data.current?.post as CalendarEntry;
    if (entry) setActivePost(entry);
  };

  const handleDragOver = (e: DragOverEvent) => {
    setOverDropId(e.over?.id ? String(e.over.id) : null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActivePost(null);
    setOverDropId(null);
    const { active, over } = event;
    if (!over || !active.data.current?.post) return;

    const entry = active.data.current.post as CalendarEntry;
    const dropId = over.id as string;

    let newDate: Date;
    let newHour: number | undefined;

    if (dropId.includes('_')) {
      const [dateStr, hourStr] = dropId.split('_');
      newDate = new Date(dateStr + 'T00:00:00');
      newHour = parseInt(hourStr, 10);
    } else {
      newDate = new Date(dropId + 'T00:00:00');
    }

    const current = parseISO(entry.entryScheduledAt);

    // All day/hour comparisons and target construction use America/Bogota (matches backend bogotaDayKey)
    const currentBogotaHour = hourInTz(current.toISOString(), SCHEDULING_TZ);
    const targetHour = newHour ?? currentBogotaHour;
    const dropDateStr = dropId.includes('_') ? dropId.split('_')[0]! : dropId;

    // No-op: mismo día Bogotá Y misma hora Bogotá → no hay cambio real
    const isSame = sameDayInTz(current, newDate, SCHEDULING_TZ) && targetHour === currentBogotaHour;
    if (isSame) return;

    // Construir target UTC desde hora local Bogotá
    const targetDate = localHourToUtcFn(dropDateStr, targetHour, SCHEDULING_TZ);
    const iso = targetDate.toISOString();
    // Update the correct platform-specific field based on which calendar entry was dragged
    const dragBody: Record<string, unknown> = { scheduledAt: iso };
    if (entry.entryPlatform === 'instagram') {
      dragBody.scheduledAtInstagram = iso;
    } else if (entry.entryPlatform === 'tiktok') {
      dragBody.scheduledAtTiktok = iso;
      // Also update scheduledAt to the earlier of IG (unchanged) and new TK time
      if (entry.scheduledAtInstagram) {
        const igTime = parseISO(entry.scheduledAtInstagram).getTime();
        dragBody.scheduledAt = igTime <= targetDate.getTime() ? entry.scheduledAtInstagram : iso;
      }
    } else {
      // Single platform or both-at-same-time: update all fields that exist
      if (entry.scheduledAtInstagram) dragBody.scheduledAtInstagram = iso;
      if (entry.scheduledAtTiktok)    dragBody.scheduledAtTiktok    = iso;
    }

    reschedule.mutate({ id: entry.id, body: dragBody });
  };

  // ── Reschedule to today at next optimal hour (user's timezone) ──
  const handleRescheduleToday = (post: Post) => {
    const today = new Date();
    const hour = nextOptimalHour(userTz);
    const target = localHourToUtcFn(
      format(today, 'yyyy-MM-dd'),
      hour,
      userTz,
    );
    const iso = target.toISOString();
    const body: Record<string, unknown> = { scheduledAt: iso };
    if (post.scheduledAtInstagram) body.scheduledAtInstagram = iso;
    if (post.scheduledAtTiktok)    body.scheduledAtTiktok    = iso;
    reschedule.mutate({ id: post.id, body });
  };

  // Build a UTC Date from a local date string + hour in the user's timezone
  const bogotaToUtc = (dateStr: string, localHour: number): Date =>
    localHourToUtcFn(dateStr, localHour, userTz);

  // Reschedule to a specific date/hour (Bogotá time = UTC-5).
  // Uses the shared reschedule mutation so errors are handled and the calendar
  // only refreshes on success. onDone() is called after a successful save.
  const handleRescheduleToDate = (
    post: Post,
    payload: { date: string; igHour?: number; tkHour?: number; allHour?: number },
    onDone?: () => void
  ) => {
    const { date, igHour, tkHour, allHour } = payload;
    const body: Record<string, unknown> = {};

    if (igHour !== undefined && tkHour !== undefined) {
      // Per-platform scheduling
      const igTarget = bogotaToUtc(date, igHour);
      const tkTarget = bogotaToUtc(date, tkHour);
      body.scheduledAtInstagram = igTarget.toISOString();
      body.scheduledAtTiktok    = tkTarget.toISOString();
      // scheduledAt = earliest of the two (for sorting/fallback)
      body.scheduledAt = (igTarget <= tkTarget ? igTarget : tkTarget).toISOString();
    } else {
      const target = bogotaToUtc(date, allHour ?? 12);
      body.scheduledAt = target.toISOString();
      // If post has per-platform fields, update them too
      if (post.scheduledAtInstagram) body.scheduledAtInstagram = target.toISOString();
      if (post.scheduledAtTiktok)    body.scheduledAtTiktok    = target.toISOString();
    }

    // If the post failed, reset it to scheduled so the publisher picks it up
    if (post.status === 'failed') body.status = 'scheduled';

    reschedule.mutate({ id: post.id, body }, { onSuccess: () => onDone?.() });
  };

  const navLabel = viewMode === "month"
    ? format(currentDate, 'MMMM yyyy', { locale: es })
    : `${format(weekStart, 'MMM d', { locale: es })} - ${format(weekEnd, 'MMM d, yyyy', { locale: es })}`;

  const statusCounts = posts.reduce((acc, p) => {
    const effectiveStatus = (() => {
      if (p.status === 'scheduled') {
        const sat = p.scheduledAtInstagram ?? p.scheduledAtTiktok ?? p.scheduledAt;
        if (sat) { try { if (parseISO(sat) < new Date()) return 'failed'; } catch { /* ignore */ } }
      }
      return p.status;
    })();
    acc[effectiveStatus] = (acc[effectiveStatus] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Build a sorted list of months (beyond the current view) that have pending/scheduled posts
  const viewYearMonth = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  const futureMonthsMap: Record<string, { count: number; year: number; month: number }> = {};
  for (const p of posts) {
    if (!p.scheduledAt) continue;
    if (p.status !== 'pending_approval' && p.status !== 'scheduled') continue;
    const d = parseISO(p.scheduledAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key <= viewYearMonth) continue; // current or past month — shown in the grid already
    if (!futureMonthsMap[key]) futureMonthsMap[key] = { count: 0, year: d.getFullYear(), month: d.getMonth() };
    futureMonthsMap[key].count++;
  }
  const futureMonths = Object.entries(futureMonthsMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="space-y-6 h-full flex flex-col">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
            <div>
              <h1 className="text-2xl sm:text-4xl font-display font-bold text-foreground drop-shadow-[0_0_15px_rgba(0,119,255,0.3)] flex items-center gap-2 sm:gap-3">
                <CalendarIcon className="w-6 h-6 sm:w-8 sm:h-8 text-primary shrink-0" />
                Parrilla de Contenido
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Aquí ves todos tus posts programados en el calendario. Haz clic en uno para ver los detalles o arrastrarlo a otro día para cambiar la fecha de publicación.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {reschedule.isPending && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Guardando…
                </span>
              )}
              {/* Bulk mode toggle */}
              <Button
                variant={bulkMode ? "default" : "ghost"}
                size="sm"
                onClick={toggleBulkMode}
                className={`text-xs gap-1.5 ${bulkMode ? "bg-primary text-primary-foreground" : "border border-border/50"}`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {bulkMode ? `Seleccionando (${selectedPostIds.size})` : "Seleccionar"}
              </Button>
              {/* Business selector — visible to any user with more than one business */}
              {userBusinesses.length > 1 && (
                <div className="flex items-center gap-1 bg-card border border-border/50 p-1 rounded-lg">
                  {userBusinesses.map(biz => (
                    <Button
                      key={biz.id}
                      variant={calendarBizScope === biz.id ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCalendarBizScope(biz.id)}
                      className={`text-xs max-w-[120px] truncate ${calendarBizScope === biz.id ? "bg-primary text-primary-foreground" : ""}`}
                      title={biz.name ?? undefined}
                    >
                      {biz.name ?? `Negocio ${biz.id}`}
                    </Button>
                  ))}
                  <div className="w-px h-4 bg-border/60 mx-0.5 shrink-0" />
                  <Button
                    variant={calendarBizScope === "all" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCalendarBizScope("all")}
                    className={`text-xs ${calendarBizScope === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    Todos
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-1 bg-card border border-border/50 p-1 rounded-lg">
                <Button variant={viewMode === "month" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("month")}
                  className={viewMode === "month" ? "bg-primary text-primary-foreground" : ""}>
                  <Grid3x3 className="w-4 h-4 mr-1" /> Mes
                </Button>
                <Button variant={viewMode === "week" ? "default" : "ghost"} size="sm" onClick={() => setViewMode("week")}
                  className={viewMode === "week" ? "bg-primary text-primary-foreground" : ""}>
                  <AlignJustify className="w-4 h-4 mr-1" /> Semana
                </Button>
              </div>
              <div className="flex items-center gap-2 bg-card border border-border/50 p-1 rounded-lg">
                <Button variant="ghost" size="icon" onClick={navigatePrev} className="hover:bg-white/5"><ChevronLeft className="w-4 h-4" /></Button>
                <Button variant="ghost" onClick={() => setCurrentDate(new Date())} className="font-medium hover:bg-white/5 text-sm px-3 capitalize">
                  {navLabel}
                </Button>
                <Button variant="ghost" size="icon" onClick={navigateNext} className="hover:bg-white/5"><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          </div>

          {/* ── Banner: negocio activo sin cuentas (vista de negocio específico) ── */}
          {(() => {
            if (calendarBizScope === "all") return null;
            if (!bizContextLoaded || !socialAccountsLoaded || globalBizId == null) return null;
            if (socialAccounts.some(a => a.businessId === globalBizId && a.connected === "true")) return null;
            return (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 shrink-0">
                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-yellow-300 font-medium leading-snug">
                    Este negocio no tiene cuentas de redes sociales conectadas. Los posts generados no se publicarán automáticamente.
                  </p>
                  <p className="text-xs text-yellow-400/70 mt-1">
                    Ve a <Link href="/settings" className="underline underline-offset-2 hover:text-yellow-300 transition-colors">Configuración → Cuentas Sociales</Link> para conectar Instagram o TikTok.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* ── Banner: resumen de negocios sin cuentas en vista "Todos" ── */}
          {(() => {
            if (calendarBizScope !== "all" || !socialAccountsLoaded || userBusinesses.length === 0) return null;
            const missing = userBusinesses.filter(
              biz => !socialAccounts.some(a => a.businessId === biz.id && a.connected === "true")
            );
            if (missing.length === 0) return null;
            return (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 shrink-0">
                <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-yellow-300 font-medium leading-snug">
                    {missing.length === 1
                      ? `"${missing[0].name ?? `Negocio ${missing[0].id}`}" no tiene cuentas conectadas — sus posts no se publicarán.`
                      : `${missing.length} negocios sin cuentas conectadas: ${missing.map(b => b.name ?? `Negocio ${b.id}`).join(", ")}.`
                    }
                  </p>
                  <p className="text-xs text-yellow-400/70 mt-1">
                    Ve a <Link href="/settings" className="underline underline-offset-2 hover:text-yellow-300 transition-colors">Configuración → Cuentas Sociales</Link> para conectarlos.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Legend + counts */}
          <div className="flex gap-4 items-center shrink-0 text-xs font-medium text-muted-foreground uppercase tracking-widest flex-wrap">
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" /> Publicado
              {statusCounts['published'] ? <span className="text-emerald-500 font-bold">{statusCounts['published']}</span> : null}
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-secondary" /> Programado
              {statusCounts['scheduled'] ? <span className="text-secondary font-bold">{statusCounts['scheduled']}</span> : null}
            </span>
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-400" /> Pendiente
              {statusCounts['pending_approval'] ? <span className="text-amber-400 font-bold">{statusCounts['pending_approval']}</span> : null}
            </span>
            {statusCounts['failed'] ? (
              <span className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" /> Error
                <span className="text-red-500 font-bold">{statusCounts['failed']}</span>
              </span>
            ) : null}
            {/* Content type legend */}
            <span className="text-border/60 hidden sm:inline">|</span>
            <span className="flex items-center gap-3 text-[10px] normal-case tracking-normal text-muted-foreground/70 flex-wrap">
              <span className="flex items-center gap-1">📷 <span>Foto</span></span>
              <span className="flex items-center gap-1">🎠 <span>Carrusel</span></span>
              <span className="flex items-center gap-1">🎬 <span>Reel</span></span>
              <span className="flex items-center gap-1">📖 <span>Historia</span></span>
            </span>
          </div>

          {/* Sugerencias IA */}
          <div className="shrink-0">
            <AIPostingSuggestionsPanel collapsible={true} />
          </div>

          {/* Future months strip — visible when there are pending/scheduled posts beyond the current view */}
          {futureMonths.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Próximos:</span>
              {futureMonths.map(({ year, month, count }) => {
                const label = format(new Date(year, month, 1), 'MMM yyyy', { locale: es });
                return (
                  <button
                    key={`${year}-${month}`}
                    onClick={() => setCurrentDate(new Date(year, month, 1))}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs font-semibold hover:bg-amber-400/20 transition-colors capitalize"
                  >
                    <span>{label}</span>
                    <span className="bg-amber-400/30 text-amber-200 rounded-full px-1.5 py-0.5 text-[10px] leading-none">{count}</span>
                    <ChevronRight className="w-3 h-3 opacity-60" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Month view */}
          {viewMode === "month" ? (
            <Card className="glass-card flex-1 flex flex-col overflow-hidden min-h-[500px]">
              <div className="grid grid-cols-7 border-b border-border/50 bg-black/40 shrink-0">
                {[
                  { full: 'Dom', short: 'D' },
                  { full: 'Lun', short: 'L' },
                  { full: 'Mar', short: 'M' },
                  { full: 'Mié', short: 'X' },
                  { full: 'Jue', short: 'J' },
                  { full: 'Vie', short: 'V' },
                  { full: 'Sáb', short: 'S' },
                ].map((day) => (
                  <div key={day.full} className="py-2 px-1 sm:p-3 text-center text-xs font-bold text-muted-foreground uppercase tracking-widest border-r border-border/30 last:border-0">
                    <span className="hidden sm:inline">{day.full}</span>
                    <span className="sm:hidden">{day.short}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 auto-rows-auto bg-card/10">
                {isLoading ? (
                  <div className="col-span-7 flex items-center justify-center gap-3 text-muted-foreground">
                    <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                    Cargando parrilla…
                  </div>
                ) : (
                  <>
                    {Array.from({ length: monthStart.getDay() }).map((_, i) => (
                      <div key={`empty-${i}`} className="border-r border-b border-border/20 bg-black/20 p-2 opacity-50" />
                    ))}
                    {daysInMonth.map((date) => {
                      const dayPosts = getPostsForDay(date);
                      const isCurrentDay = isToday(date);
                      const dropId = formatCalendarDayKey(date);
                      // Show "mark as published" only on days with no active/published posts
                      const hasActivePost = dayPosts.some(p => p.status !== 'rejected');
                      const isBlockable = !hasActivePost;
                      const isBlocking = blockingDate === dropId;
                      return (
                        <DroppableDay key={date.toString()} date={date} isCurrentDay={isCurrentDay} isOver={overDropId === dropId}>
                          <span className={`text-sm font-medium ml-1 ${isCurrentDay ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                            {format(date, 'd')}
                          </span>
                          <div className="flex-1 overflow-y-auto space-y-1 no-scrollbar mt-1">
                            {dayPosts.map(entry => (
                              <DraggablePost key={entry.entryKey} post={entry} onOpen={setSelectedPost} bulkMode={bulkMode} isSelected={selectedPostIds.has(entry.id)} onToggleSelect={toggleSelectPost} hasNoAccounts={socialAccountsLoaded && entry.businessId != null && entry.entryStatus !== 'published' && !socialAccounts.some(a => a.businessId === entry.businessId && a.connected === "true")} />
                            ))}
                          </div>
                          {/* Mark as manually published — only on empty days */}
                          {isBlockable && (
                            <button
                              onClick={() => {
                                if (isBlocking) return;
                                if (window.confirm(`¿Marcar el ${format(date, 'd MMM', { locale: es })} como publicado manualmente? El sistema no generará contenido para ese día.`)) {
                                  setBlockingDate(dropId);
                                  blockDay.mutate(dropId);
                                }
                              }}
                              className="mt-1 w-full flex items-center justify-center gap-1 text-[9px] text-muted-foreground/40 hover:text-primary/70 hover:bg-primary/10 rounded transition-all opacity-0 group-hover:opacity-100 py-0.5"
                              title="Marcar como publicado manualmente"
                            >
                              {isBlocking
                                ? <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                : <><PlusCircle className="w-2.5 h-2.5" /> Marcar publicado</>
                              }
                            </button>
                          )}
                        </DroppableDay>
                      );
                    })}
                    {Array.from({ length: Math.max(0, 42 - (monthStart.getDay() + daysInMonth.length)) }).map((_, i) => (
                      <div key={`empty-end-${i}`} className="border-r border-b border-border/20 bg-black/20 p-2 opacity-50" />
                    ))}
                  </>
                )}
              </div>
            </Card>
          ) : (
            // Week view
            <Card className="glass-card flex-1 flex flex-col overflow-auto">
              <div className="grid grid-cols-8 border-b border-border/50 bg-black/40 shrink-0">
                <div className="p-3 text-xs font-bold text-muted-foreground uppercase tracking-widest border-r border-border/30">Hora</div>
                {daysInWeek.map((date) => (
                  <div key={date.toString()} className={`p-3 text-center border-r border-border/30 last:border-0 ${isToday(date) ? 'bg-primary/10' : ''}`}>
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{format(date, 'EEE', { locale: es })}</div>
                    <div className={`text-lg font-display font-bold mt-1 ${isToday(date) ? 'text-primary' : 'text-foreground'}`}>{format(date, 'd')}</div>
                  </div>
                ))}
              </div>
              {isLoading ? (
                <div className="flex items-center justify-center h-40 gap-3 text-muted-foreground">
                  <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                  Cargando…
                </div>
              ) : (
                weekHourSlots.map((hour) => (
                  <div key={hour} className="grid grid-cols-8 border-b border-border/20 min-h-[80px]">
                    <div className="p-3 border-r border-border/20 text-xs text-muted-foreground font-medium pt-2 shrink-0">
                      {formatHour12(hour)}
                    </div>
                    {daysInWeek.map((date) => {
                      const dayPosts = getPostsForDay(date).filter(entry =>
                        hourInTz(entry.entryScheduledAt, SCHEDULING_TZ) === hour
                      );
                      const dropId = `${formatCalendarDayKey(date)}_${hour}`;
                      return (
                        <DroppableWeekCell key={date.toString()} date={date} hour={hour} isCurrentDay={isToday(date)} isOver={overDropId === dropId}>
                          {dayPosts.map(entry => (
                            <DraggablePost key={entry.entryKey} post={entry} onOpen={setSelectedPost} bulkMode={bulkMode} isSelected={selectedPostIds.has(entry.id)} onToggleSelect={toggleSelectPost} hasNoAccounts={socialAccountsLoaded && entry.businessId != null && entry.entryStatus !== 'published' && !socialAccounts.some(a => a.businessId === entry.businessId && a.connected === "true")} />
                          ))}
                        </DroppableWeekCell>
                      );
                    })}
                  </div>
                ))
              )}
            </Card>
          )}
        </div>

        <DragOverlay>
          {activePost ? <PostDragOverlay post={activePost} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Post detail popup */}
      {selectedPost && (
        <PostPopup
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onRescheduleToday={handleRescheduleToday}
          onRescheduleToDate={handleRescheduleToDate}
        />
      )}

      {/* Bulk action floating bar */}
      {bulkMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl border border-border/60 bg-card/95 backdrop-blur-md">
          <button
            onClick={selectAll}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border/40 hover:bg-white/5 transition-colors"
          >
            Todo
          </button>
          <div className="h-4 w-px bg-border/50" />
          <span className="text-sm font-semibold text-foreground px-1">
            {selectedPostIds.size} seleccionado{selectedPostIds.size !== 1 ? "s" : ""}
          </span>
          <div className="h-4 w-px bg-border/50" />
          <button
            disabled={selectedPostIds.size === 0}
            onClick={() => setBulkConfirmAction("pending")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Pendiente
          </button>
          <button
            disabled={selectedPostIds.size === 0}
            onClick={() => setBulkConfirmAction("scheduled")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-secondary/50 text-secondary hover:bg-secondary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            Programar
          </button>
          <button
            disabled={selectedPostIds.size === 0}
            onClick={() => setBulkConfirmAction("delete")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar
          </button>
          <div className="h-4 w-px bg-border/50" />
          <button
            onClick={toggleBulkMode}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk action confirmation dialog */}
      <AlertDialog open={bulkConfirmAction !== null} onOpenChange={o => { if (!o) setBulkConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{bulkActionLabel}</AlertDialogTitle>
            <AlertDialogDescription>{bulkActionDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkConfirm}
              className={bulkConfirmAction === "delete" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
            >
              {bulkConfirmAction === "delete" ? "Eliminar" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
