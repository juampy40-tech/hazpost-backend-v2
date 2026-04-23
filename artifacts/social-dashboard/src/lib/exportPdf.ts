import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AnalyticsSummary } from "@workspace/api-client-react";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const CONTENT_LABELS: Record<string, string> = {
  image: "Imagen", reel: "Reel", carousel: "Carrusel", story: "Historia",
};
const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok", both: "Ambas",
};

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("es-CO");
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface ExportPdfOptions {
  businessName: string;
  period?: string;
  logoUrl?: string | null;
  plan?: string;
  data: AnalyticsSummary | undefined;
  insights: { icon: string; title: string; detail: string }[];
  chartImage?: string | null;
}

type RGB = [number, number, number];
const BRAND_GREEN: RGB = [0, 194, 83];
const BRAND_BLUE: RGB  = [0, 194, 255];
const DARK_BG: RGB     = [15, 23, 42];
const DARK_CARD: RGB   = [22, 33, 58];
const TEXT_MAIN: RGB   = [241, 245, 249];
const TEXT_MUTED: RGB  = [148, 163, 184];

export async function exportarReportePDF(opts: ExportPdfOptions): Promise<void> {
  const { businessName, plan, data, insights, chartImage } = opts;
  const period = opts.period ?? generarPeriodo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;

  const logoDataUrl = opts.logoUrl ? await loadImageAsDataUrl(opts.logoUrl) : null;

  // ─── PAGE 1 — PORTADA ──────────────────────────────────────────────────────
  doc.setFillColor(...DARK_BG);
  doc.rect(0, 0, W, H, "F");

  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, 0, W, 3, "F");
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(W / 2, 0, W / 2, 3, "F");

  const logoY = 48;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(36);
  doc.setTextColor(...TEXT_MAIN);
  doc.text("haz", 62, logoY, { align: "right" });
  doc.setTextColor(...BRAND_BLUE);
  doc.text("post", 62, logoY);
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont("helvetica", "normal");
  doc.text("Social Media con IA", W / 2, logoY + 8, { align: "center" });

  doc.setDrawColor(...BRAND_GREEN);
  doc.setLineWidth(0.3);
  doc.line(30, logoY + 14, W - 30, logoY + 14);

  let logoHeight = 0;
  if (logoDataUrl) {
    try {
      const imgFormat = logoDataUrl.startsWith("data:image/png") ? "PNG"
        : logoDataUrl.startsWith("data:image/webp") ? "WEBP"
        : "JPEG";
      doc.addImage(logoDataUrl, imgFormat, W / 2 - 18, logoY + 20, 36, 36, undefined, "FAST");
      logoHeight = 44;
    } catch {}
  }

  const titleY = logoY + 24 + logoHeight;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...TEXT_MAIN);
  doc.text(businessName, W / 2, titleY, { align: "center", maxWidth: 160 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Reporte de Analytics", W / 2, titleY + 10, { align: "center" });

  const badgeY = titleY + 22;
  doc.setFillColor(...DARK_CARD);
  doc.setDrawColor(...BRAND_GREEN);
  doc.setLineWidth(0.3);
  doc.roundedRect(W / 2 - 42, badgeY - 6, 84, 12, 3, 3, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_GREEN);
  doc.text(period, W / 2, badgeY + 1.5, { align: "center" });

  if (plan && plan !== "free") {
    const PLAN_LABELS: Record<string, string> = { starter: "Starter", business: "Business", agency: "Agencia" };
    const planLabel = PLAN_LABELS[plan] ?? plan;
    doc.setFillColor(30, 58, 138);
    doc.setDrawColor(99, 179, 237);
    doc.setLineWidth(0.2);
    doc.roundedRect(W / 2 - 18, badgeY + 10, 36, 9, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(147, 210, 255);
    doc.text(`Plan ${planLabel}`, W / 2, badgeY + 15.8, { align: "center" });
  }

  const genDate = new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" });
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.setFont("helvetica", "normal");
  doc.text(`Generado el ${genDate}`, W / 2, H - 28, { align: "center" });
  doc.text("hazpost.app — IA para redes sociales", W / 2, H - 22, { align: "center" });

  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, H - 3, W / 2, 3, "F");
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(W / 2, H - 3, W / 2, 3, "F");

  // ─── PAGE 2 — GRÁFICOS CAPTURADOS ──────────────────────────────────────────
  if (chartImage) {
    doc.addPage();
    darkPage(doc, W, H);
    pageHeader(doc, "Vista del Panel de Analytics", W);
    try {
      const imgProps = doc.getImageProperties(chartImage);
      const aspectRatio = imgProps.width / imgProps.height;
      const maxW = W - 20;
      const maxH = H - 50;
      let imgW = maxW;
      let imgH = imgW / aspectRatio;
      if (imgH > maxH) {
        imgH = maxH;
        imgW = imgH * aspectRatio;
      }
      const imgX = (W - imgW) / 2;
      doc.addImage(chartImage, "PNG", imgX, 30, imgW, imgH, undefined, "FAST");
    } catch {}
    pageFooter(doc, businessName, doc.getNumberOfPages(), W, H);
  }

  // ─── PAGE — RESUMEN ──────────────────────────────────────────────────────
  doc.addPage();
  darkPage(doc, W, H);
  pageHeader(doc, "Resumen de Actividad", W);

  const ov = data?.overview ?? { total: 0, published: 0, scheduled: 0, pending: 0, failed: 0, likes: 0, comments: 0, shares: 0, reach: 0, saves: 0 };
  const successRate = ov.total > 0 ? Math.round((ov.published / ov.total) * 100) : 0;
  const ovSaves = (ov as typeof ov & { saves?: number }).saves ?? 0;
  const engagementScore = (ov.likes ?? 0) + ovSaves * 2 + (ov.comments ?? 0);
  const overallER = ov.reach > 0 ? Math.round((engagementScore / ov.reach) * 1000) / 10 : 0;

  autoTable(doc, {
    startY: 36,
    head: [["Métrica", "Valor", "Detalle"]],
    body: [
      ["Posts publicados",   fmt(ov.published),  `${successRate}% tasa de éxito`],
      ["Posts programados",  fmt(ov.scheduled),  "En cola para publicar"],
      ["En aprobación",      fmt(ov.pending),    "Pendientes de revisión"],
      ["Posts fallidos",     fmt(ov.failed),     ov.failed > 0 ? "Revisar conexión" : "Sin errores"],
      ["Total generados",    fmt(ov.total),      "Todos los estados"],
      ["Likes totales",      fmt(ov.likes),      "Suma acumulada"],
      ["Comentarios",        fmt(ov.comments),   "Suma acumulada"],
      ["Compartidos",        fmt(ov.shares),     "Suma acumulada"],
      ["Guardados",          fmt(ovSaves),       "Suma acumulada"],
      ["Alcance total",      fmt(ov.reach),      "Personas unicas alcanzadas"],
      ["Tasa de engagement", `${overallER}%`,    overallER >= 3 ? "Excelente" : overallER >= 1 ? "Bueno" : "Necesita mejorar"],
    ],
    theme: "grid",
    styles: { fillColor: DARK_CARD, textColor: TEXT_MAIN, fontSize: 10, cellPadding: 3.5 },
    headStyles: { fillColor: [10, 30, 60], textColor: BRAND_GREEN, fontStyle: "bold", fontSize: 10 },
    alternateRowStyles: { fillColor: [19, 28, 50] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 60 },
      1: { halign: "center", textColor: TEXT_MAIN, fontStyle: "bold", cellWidth: 40 },
      2: { textColor: TEXT_MUTED, cellWidth: 75 },
    },
  });

  if (data?.byPlatform && data.byPlatform.length > 0) {
    const afterY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    sectionLabel(doc, "Rendimiento por Plataforma", afterY);
    autoTable(doc, {
      startY: afterY + 8,
      head: [["Plataforma", "Posts", "Likes", "Comentarios", "Alcance", "ER%"]],
      body: data.byPlatform.map(p => {
        const anyP = p as typeof p & { engagementRate?: number };
        return [
          PLATFORM_LABELS[p.platform] ?? p.platform,
          fmt(p.count), fmt(p.likes), fmt(p.comments), fmt(p.reach),
          anyP.engagementRate != null ? `${anyP.engagementRate}%` : "—",
        ];
      }),
      theme: "grid",
      styles: { fillColor: DARK_CARD, textColor: TEXT_MAIN, fontSize: 10, cellPadding: 3.5 },
      headStyles: { fillColor: [10, 30, 60], textColor: BRAND_BLUE, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [19, 28, 50] },
      columnStyles: {
        0: { fontStyle: "bold" },
        1: { halign: "center" }, 2: { halign: "center" },
        3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center" },
      },
    });
  }

  pageFooter(doc, businessName, doc.getNumberOfPages(), W, H);

  // ─── PAGE — DETALLE ────────────────────────────────────────────────────────
  doc.addPage();
  darkPage(doc, W, H);
  pageHeader(doc, "Analisis por Formato y Dia", W);

  if (data?.byContentType && data.byContentType.length > 0) {
    sectionLabel(doc, "Rendimiento por Formato de Contenido", 36);
    autoTable(doc, {
      startY: 44,
      head: [["Formato", "Posts", "Likes promedio", "Alcance promedio"]],
      body: data.byContentType.map(ct => [
        CONTENT_LABELS[ct.contentType ?? ""] ?? ct.contentType,
        fmt(ct.count), fmt(ct.likes), fmt(ct.reach),
      ]),
      theme: "grid",
      styles: { fillColor: DARK_CARD, textColor: TEXT_MAIN, fontSize: 10, cellPadding: 3.5 },
      headStyles: { fillColor: [10, 30, 60], textColor: [167, 139, 250], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [19, 28, 50] },
      columnStyles: {
        0: { fontStyle: "bold" },
        1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" },
      },
    });
  }

  if (data?.byDayOfWeek && data.byDayOfWeek.length > 0) {
    const afterY2 = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    sectionLabel(doc, "Mejores Dias para Publicar", afterY2);
    const sortedDays = [...data.byDayOfWeek].sort((a, b) => b.likes - a.likes);
    autoTable(doc, {
      startY: afterY2 + 8,
      head: [["Dia", "Posts", "Likes totales", "Ranking"]],
      body: sortedDays.map((d, i) => [
        DAYS[d.day] ?? d.day, fmt(d.count), fmt(d.likes),
        i === 0 ? "Mejor dia" : i === 1 ? "2do" : i === 2 ? "3ro" : `${i + 1}`,
      ]),
      theme: "grid",
      styles: { fillColor: DARK_CARD, textColor: TEXT_MAIN, fontSize: 10, cellPadding: 3.5 },
      headStyles: { fillColor: [10, 30, 60], textColor: [251, 191, 36], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [19, 28, 50] },
      columnStyles: {
        0: { fontStyle: "bold" },
        1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" },
      },
    });
  }

  pageFooter(doc, businessName, doc.getNumberOfPages(), W, H);

  // ─── PAGE — INSIGHTS ───────────────────────────────────────────────────────
  if (insights.length > 0) {
    doc.addPage();
    darkPage(doc, W, H);
    pageHeader(doc, "Aprendizajes y Recomendaciones IA", W);

    let curY = 38;
    insights.forEach((ins) => {
      if (curY > H - 50) {
        doc.addPage();
        darkPage(doc, W, H);
        curY = 20;
      }
      doc.setFillColor(...DARK_CARD);
      doc.setDrawColor(0, 120, 50);
      doc.setLineWidth(0.3);
      doc.roundedRect(14, curY, W - 28, 24, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND_GREEN);
      const titleClean = ins.title.replace(/[^\x00-\x7F]/g, "").trim() || ins.title;
      doc.text(titleClean, 20, curY + 8, { maxWidth: W - 44 });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...TEXT_MUTED);
      const lines = doc.splitTextToSize(ins.detail, W - 44);
      doc.text(lines, 20, curY + 15);
      curY += 28;
    });

    pageFooter(doc, businessName, doc.getNumberOfPages(), W, H);
  }

  // ─── PAGE — TOP POSTS ──────────────────────────────────────────────────────
  if (data?.topPosts && data.topPosts.length > 0) {
    doc.addPage();
    darkPage(doc, W, H);
    pageHeader(doc, "Top Posts por Tasa de Engagement", W);

    autoTable(doc, {
      startY: 36,
      head: [["#", "Formato", "Plataforma", "Likes", "Alcance", "ER%", "Texto (inicio)"]],
      body: data.topPosts.slice(0, 10).map((post, i) => {
        const score = (post.likes ?? 0) + (post.saves ?? 0) * 2 + (post.comments ?? 0);
        const er = (post.reach ?? 0) > 0 ? (Math.round((score / post.reach!) * 1000) / 10).toString() + "%" : "—";
        return [
          `${i + 1}`,
          CONTENT_LABELS[post.contentType ?? ""] ?? (post.contentType ?? "—"),
          PLATFORM_LABELS[post.platform] ?? post.platform,
          fmt(post.likes), fmt(post.reach), er,
          (post.caption?.split("\n")[0] ?? "").slice(0, 60),
        ];
      }),
      theme: "grid",
      styles: { fillColor: DARK_CARD, textColor: TEXT_MAIN, fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [10, 30, 60], textColor: BRAND_GREEN, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [19, 28, 50] },
      columnStyles: {
        0: { halign: "center", cellWidth: 8 },
        1: { cellWidth: 22 }, 2: { cellWidth: 24 },
        3: { halign: "center", cellWidth: 18 },
        4: { halign: "center", cellWidth: 22 },
        5: { halign: "center", cellWidth: 14 },
        6: { cellWidth: 72 },
      },
    });

    pageFooter(doc, businessName, doc.getNumberOfPages(), W, H);
  }

  const safeName = businessName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, "").trim().replace(/\s+/g, "-");
  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`hazpost-reporte-${safeName}-${dateStr}.pdf`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function darkPage(doc: jsPDF, W: number, H: number) {
  doc.setFillColor(...DARK_BG);
  doc.rect(0, 0, W, H, "F");
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(0, 0, W, 2, "F");
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(W / 2, 0, W / 2, 2, "F");
}

function pageHeader(doc: jsPDF, title: string, W: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...TEXT_MAIN);
  doc.text(title, 14, 20);
  doc.setDrawColor(...BRAND_GREEN);
  doc.setLineWidth(0.3);
  doc.line(14, 24, W - 14, 24);
}

function sectionLabel(doc: jsPDF, label: string, y: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(label.toUpperCase(), 14, y);
}

function pageFooter(doc: jsPDF, businessName: string, page: number, W: number, H: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(businessName, 14, H - 8);
  doc.text(`Pag. ${page}`, W - 14, H - 8, { align: "right" });
  doc.text("hazpost.app", W / 2, H - 8, { align: "center" });
  doc.setDrawColor(30, 40, 70);
  doc.setLineWidth(0.2);
  doc.line(14, H - 12, W - 14, H - 12);
}

export function generarPeriodo(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${start.toLocaleDateString("es-CO", opts)} - ${end.toLocaleDateString("es-CO", opts)}`;
}

export function generarPeriodoCustom(year: number, month: number): string {
  const start = new Date(year, month, 1);
  const end   = new Date(year, month + 1, 0);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return `${start.toLocaleDateString("es-CO", opts)} - ${end.toLocaleDateString("es-CO", opts)}`;
}
