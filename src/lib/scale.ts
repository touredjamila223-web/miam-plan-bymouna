/**
 * Utilitaire pour mettre à l'échelle les quantités d'une recette en fonction
 * d'un ratio (ex : 6 personnes / 4 personnes = 1.5).
 *
 * - Parse un nombre en tête de chaîne ("200 g", "1,5 cuillère", "1/2 oignon").
 * - Multiplie par le ratio et renvoie une chaîne lisible.
 * - Si aucun nombre n'est détecté ("au goût", "1 pincée"), la valeur est
 *   renvoyée telle quelle.
 */

function parseLeadingNumber(s: string): { value: number; rest: string } | null {
  const trimmed = s.trim();
  // fraction simple "1/2"
  const frac = /^(\d+)\s*\/\s*(\d+)\b/.exec(trimmed);
  if (frac) {
    const v = Number(frac[1]) / Number(frac[2]);
    return { value: v, rest: trimmed.slice(frac[0].length).trim() };
  }
  // mixte "1 1/2"
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)\b/.exec(trimmed);
  if (mixed) {
    const v = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    return { value: v, rest: trimmed.slice(mixed[0].length).trim() };
  }
  // décimal "150", "1,5", "1.5"
  const dec = /^(\d+(?:[.,]\d+)?)/.exec(trimmed);
  if (dec) {
    const v = Number(dec[1].replace(",", "."));
    if (!Number.isFinite(v)) return null;
    return { value: v, rest: trimmed.slice(dec[0].length).trim() };
  }
  return null;
}

function formatScaled(value: number, unit: string): string {
  const u = unit.toLowerCase();
  // Conversion automatique g↔kg / ml↔cl/L pour rester lisible
  if (/^g\b/.test(u) && value >= 1000) {
    const rest = unit.replace(/^g\b/i, "").trim();
    return formatScaled(value / 1000, `kg${rest ? " " + rest : ""}`);
  }
  if (/^ml\b/.test(u)) {
    if (value >= 1000) {
      const rest = unit.replace(/^ml\b/i, "").trim();
      return formatScaled(value / 1000, `L${rest ? " " + rest : ""}`);
    }
    if (value >= 100 && value % 10 === 0) {
      const rest = unit.replace(/^ml\b/i, "").trim();
      return formatScaled(value / 10, `cl${rest ? " " + rest : ""}`);
    }
  }
  // Arrondis adaptés selon l'unité
  let rounded: number;
  if (/^(g|ml|gr|cl)\b/.test(u)) {
    if (value >= 100) rounded = Math.round(value / 5) * 5;
    else if (value >= 20) rounded = Math.round(value);
    else rounded = Math.round(value * 10) / 10;
  } else if (/^(kg|l)\b/.test(u)) {
    rounded = Math.round(value * 100) / 100;
  } else if (/(unit|oeuf|œuf|gousse|tranche|pincée|pincee)/.test(u)) {
    rounded = Math.max(1, Math.round(value));
  } else {
    // c. à soupe, c. à café... arrondir au demi
    rounded = Math.round(value * 2) / 2;
  }
  const display = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace(".", ",");
  return unit ? `${display} ${unit}` : display;
}

export function scaleQty(qty: string | undefined | null, ratio: number): string {
  if (!qty) return "";
  if (ratio === 1) return qty;
  const parsed = parseLeadingNumber(qty);
  if (!parsed) return qty;
  return formatScaled(parsed.value * ratio, parsed.rest);
}

/** Calories par portion (constant) — l'IA stocke des kcal par personne. */
export function caloriesPerServing(calories: number | null | undefined): number | null {
  if (calories == null) return null;
  return Math.round(calories);
}

/** Calories totales pour N personnes = kcal/portion × N. */
export function caloriesTotal(
  caloriesPerServing: number | null | undefined,
  servings: number,
): number | null {
  if (caloriesPerServing == null) return null;
  return Math.round(caloriesPerServing * Math.max(1, servings));
}