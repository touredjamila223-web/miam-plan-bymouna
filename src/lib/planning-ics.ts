// Génère un fichier ICS (RFC 5545) à partir d'un planning hebdo.

type PlanEntry = {
  date: string; // YYYY-MM-DD
  slot: string; // "soir" | "entree" | "soupe" | "dessert" | ...
  recipes?: { title?: string | null; prep_time?: number | null; cuisine_style?: string | null } | null;
};

const SLOT_LABEL: Record<string, string> = {
  soir: "Dîner",
  midi: "Déjeuner",
  matin: "Petit-déjeuner",
  entree: "Entrée",
  soupe: "Soupe",
  dessert: "Dessert",
};

// Heures par défaut (locales) pour chaque slot
const SLOT_HOUR: Record<string, number> = {
  matin: 8,
  midi: 12,
  entree: 19,
  soupe: 19,
  soir: 19,
  dessert: 20,
};

function pad(n: number) { return String(n).padStart(2, "0"); }

function toIcsDate(d: Date) {
  // Format flottant local : YYYYMMDDTHHMMSS
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function escapeIcs(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function buildPlanningIcs(entries: PlanEntry[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MiamPlan//Planning//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const e of entries) {
    if (!e.recipes?.title) continue;
    const [y, m, d] = e.date.split("-").map(Number);
    if (!y || !m || !d) continue;
    const hour = SLOT_HOUR[e.slot] ?? 19;
    const start = new Date(y, m - 1, d, hour, 0, 0);
    const minutes = Math.max(20, Number(e.recipes.prep_time ?? 45));
    const end = new Date(start.getTime() + minutes * 60_000);
    const uid = `${e.date}-${e.slot}-${Math.random().toString(36).slice(2, 10)}@miamplan`;
    const label = SLOT_LABEL[e.slot] ?? e.slot;
    const summary = `${label} : ${e.recipes.title}`;
    const desc = [
      `Recette : ${e.recipes.title}`,
      e.recipes.cuisine_style ? `Style : ${e.recipes.cuisine_style}` : null,
      `Préparation : ${minutes} min`,
      "Planifié via MiamPlan",
    ].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `DESCRIPTION:${escapeIcs(desc)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadPlanningIcs(weekStart: string, entries: PlanEntry[]) {
  const ics = buildPlanningIcs(entries);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `miamplan-${weekStart}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
