import { jsPDF } from "jspdf";

type Entry = {
  date: string;
  slot: "matin" | "midi" | "soir";
  recipes?: { title?: string; prep_time?: number | null; cuisine_style?: string | null } | null;
};

const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const SLOTS: Array<"matin" | "midi" | "soir"> = ["matin", "midi", "soir"];

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function generateWeekPlanPdf(weekStartIso: string, entries: Entry[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const start = startOfWeek(new Date(weekStartIso));

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Planning de la semaine", margin, margin + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  const startLabel = start.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  doc.text(`Semaine du ${startLabel}`, margin, margin + 10);

  // Grid
  const gridTop = margin + 16;
  const colW = (pageW - margin * 2) / 7;
  const rowH = (pageH - gridTop - margin) / (SLOTS.length + 1);

  doc.setTextColor(40);
  doc.setDrawColor(220);

  // Header row
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const x = margin + i * colW;
    doc.setFillColor(245, 240, 232);
    doc.rect(x, gridTop, colW, rowH * 0.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(DAY_LABELS[i], x + 3, gridTop + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`${d.getDate()}/${d.getMonth() + 1}`, x + 3, gridTop + 11);
    doc.setTextColor(40);
  }

  // Slot rows
  const bodyTop = gridTop + rowH * 0.6;
  const bodyH = pageH - margin - bodyTop;
  const slotH = bodyH / SLOTS.length;

  for (let s = 0; s < SLOTS.length; s++) {
    const slot = SLOTS[s];
    const y = bodyTop + s * slotH;
    for (let i = 0; i < 7; i++) {
      const x = margin + i * colW;
      doc.setDrawColor(220);
      doc.rect(x, y, colW, slotH);
      // Slot label
      doc.setFontSize(7);
      doc.setTextColor(140);
      doc.text(slot.toUpperCase(), x + 2, y + 4);
      // Entry
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const e = entries.find((p) => p.date === dateStr && p.slot === slot);
      if (e?.recipes?.title) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(30);
        const lines = doc.splitTextToSize(e.recipes.title, colW - 4);
        doc.text(lines.slice(0, 3), x + 2, y + 9);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(120);
        const meta = [e.recipes.cuisine_style, e.recipes.prep_time ? `${e.recipes.prep_time} min` : null]
          .filter(Boolean)
          .join(" · ");
        if (meta) doc.text(meta, x + 2, y + slotH - 3);
      }
    }
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(160);
  doc.text("MiamPlan — planning hebdomadaire", margin, pageH - 4);

  const safe = `planning_${start.toISOString().slice(0, 10)}.pdf`;
  doc.save(safe);
}