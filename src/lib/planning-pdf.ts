import { jsPDF } from "jspdf";

type Entry = {
  date: string;
  slot: string;
  recipes?: { title?: string; prep_time?: number | null; cuisine_style?: string | null } | null;
};

const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const SLOT_LABEL: Record<string, string> = {
  soir: "Dîner",
  entree: "Entrée",
  soupe: "Soupe",
  dessert: "Dessert",
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function generateWeekPlanPdf(weekStartIso: string, entries: Entry[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const start = startOfWeek(new Date(weekStartIso));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Planning de la semaine", margin, margin + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  const startLabel = start.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  doc.text(`Semaine du ${startLabel}`, margin, margin + 11);

  let y = margin + 22;
  const innerW = pageW - margin * 2;

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayEntries = entries.filter((e) => e.date === dateStr);
    const dinner = dayEntries.find((e) => e.slot === "soir");
    const extras = dayEntries.filter((e) => e.slot !== "soir" && e.slot !== "matin" && e.slot !== "midi");

    const blockH = 18 + extras.length * 6;
    if (y + blockH > pageH - margin) {
      doc.addPage();
      y = margin;
    }

    doc.setDrawColor(220);
    doc.line(margin, y, pageW - margin, y);
    y += 5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.text(`${DAY_LABELS[i]} ${d.getDate()}/${d.getMonth() + 1}`, margin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    if (dinner?.recipes?.title) {
      doc.setTextColor(30);
      const lines = doc.splitTextToSize(`Dîner — ${dinner.recipes.title}`, innerW - 40);
      doc.text(lines[0], margin + 35, y);
      if (dinner.recipes.prep_time) {
        doc.setFontSize(9);
        doc.setTextColor(140);
        doc.text(`${dinner.recipes.prep_time} min`, pageW - margin, y, { align: "right" });
      }
    } else {
      doc.setTextColor(170);
      doc.setFontSize(10);
      doc.text("Dîner — à planifier", margin + 35, y);
    }
    y += 6;

    for (const e of extras) {
      doc.setFontSize(9);
      doc.setTextColor(110);
      const label = SLOT_LABEL[e.slot] ?? e.slot;
      doc.text(`+ ${label} — ${e.recipes?.title ?? ""}`, margin + 5, y);
      y += 5;
    }
    y += 4;
  }

  doc.setFontSize(8);
  doc.setTextColor(160);
  doc.text("MiamPlan — planning hebdomadaire", margin, pageH - 6);

  const safe = `planning_${start.toISOString().slice(0, 10)}.pdf`;
  doc.save(safe);
}
