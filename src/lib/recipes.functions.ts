import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import { generateText } from "ai";


function extractJsonObject(text: string) {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Réponse IA invalide : aucun JSON détecté");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

export function extractIngredientName(ing: any): string {
  const direct =
    ing?.name ?? ing?.nom ?? ing?.ingredient ?? ing?.ingrédient ?? ing?.aliment ?? ing?.produit ?? ing?.item ?? ing?.label ?? ing?.libelle ?? ing?.libellé ?? ing?.nom_ingredient ?? ing?.nomIngredient;
  if (direct && typeof direct === "string" && direct.trim()) return direct.trim();
  if (direct && typeof direct === "object") {
    const inner = direct?.name ?? direct?.nom ?? direct?.text;
    if (inner) return String(inner).trim();
  }
  if (ing && typeof ing === "object") {
    for (const [k, v] of Object.entries(ing)) {
      if (/qty|quantit|amount|dose|unit|gram|ml|kcal|calor/i.test(k)) continue;
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

export function stringifySettings(value: any): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (Array.isArray(value)) {
    const joined = value.map((v) => stringifySettings(v) ?? "").filter(Boolean).join(" • ");
    return joined || undefined;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    return parts.length ? parts.join(" • ") : undefined;
  }
  return String(value);
}

const RESTRICTION_KEYWORDS: Record<string, string[]> = {
  "sans-porc": ["porc","lard","lardon","lardons","jambon","chorizo","bacon","saucisse","saucissons","saucisson","pancetta","speck","coppa","prosciutto","andouille","boudin"],
  "sans-fruits-de-mer": ["fruits de mer","crevette","crevettes","moule","moules","palourde","huitre","huître","crabe","langoustine","homard","calamar","encornet","seiche","poulpe","gambas","st-jacques","saint-jacques"],
  "sans-gluten": ["farine de blé","pâtes","semoule","couscous","boulgour","seitan","orge","seigle","épeautre","epeautre"],
  "sans-lactose": ["lait de vache","beurre","crème","fromage","yaourt","mozzarella","parmesan","ricotta","feta","mascarpone","gruyère","comté","emmental","cheddar","chantilly"],
  "vegetarien": ["poulet","boeuf","bœuf","veau","agneau","porc","jambon","lard","saucisse","chorizo","bacon","poisson","saumon","thon","cabillaud","crevette","fruits de mer","gésier","foie","canard","dinde"],
  "vegetalien": ["poulet","boeuf","bœuf","veau","agneau","porc","jambon","lard","saucisse","chorizo","bacon","poisson","saumon","thon","cabillaud","crevette","fruits de mer","lait","beurre","crème","fromage","yaourt","oeuf","œuf","mozzarella","miel"],
  "sans-noix": ["noix","amande","amandes","noisette","noisettes","pistache","cajou","pécan","macadamia"],
  "sans-alcool": ["vin","bière","rhum","whisky","cognac","porto","champagne","saké","vodka","gin","kirsch"],
  "sans-oeuf": ["oeuf","œuf","oeufs","œufs"],
  "halal": ["porc","lard","lardon","jambon","chorizo","bacon","saucisse","saucisson","vin","bière","rhum","alcool","kirsch","cognac"],
};

export function violatesRestrictions(recipe: any, restrictions: string[]): string[] {
  if (!restrictions?.length) return [];
  const text = [
    recipe.title, recipe.description,
    ...(recipe.ingredients ?? []).map((i: any) => `${i.name ?? ""} ${i.qty ?? ""}`),
    ...(recipe.steps ?? []).map((s: any) => s.text ?? ""),
    recipe.protein,
    ...(recipe.vegetables ?? []),
  ].join(" ").toLowerCase();
  const found: string[] = [];
  for (const r of restrictions) {
    const kws = RESTRICTION_KEYWORDS[r];
    if (!kws) continue;
    for (const kw of kws) {
      const escaped = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const re = new RegExp(`(^|[^a-zàâçéèêëîïôûùüÿñæœ])${escaped}([^a-zàâçéèêëîïôûùüÿñæœ]|$)`, "i");
      if (re.test(text)) { found.push(r); break; }
    }
  }
  return found;
}

export function normalizeTitle(t: string): string {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PANTRY = new Set([
  "sel","poivre","huile","eau","ail","oignon","oignons","echalote","echalotes",
  "beurre","sucre","farine","persil","coriandre","basilic","thym","laurier",
  "cumin","paprika","curry","piment","vinaigre","citron","bouillon","epices",
  "sauce","creme","lait","moutarde","miel","gingembre","ras","mix","mélange",
]);

function normWord(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Signature stable d'une recette : protéine + ingrédients clés normalisés
 * (hors ingrédients de garde-manger). Permet de détecter des doublons
 * même quand le titre diffère.
 */
export function recipeSignature(r: any): string {
  const protein = normWord(r?.protein ?? "").split(" ")[0] ?? "";
  const ings: any[] = Array.isArray(r?.ingredients) ? r.ingredients : [];
  const veg: any[] = Array.isArray(r?.vegetables) ? r.vegetables : [];
  const tokens = new Set<string>();
  for (const i of ings) {
    const name = typeof i === "string" ? i : (i?.name ?? "");
    const first = normWord(name).split(" ").find((w) => w.length > 2 && !PANTRY.has(w));
    if (first) tokens.add(first);
  }
  for (const v of veg) {
    const first = normWord(String(v)).split(" ").find((w) => w.length > 2 && !PANTRY.has(w));
    if (first) tokens.add(first);
  }
  const keys = Array.from(tokens).sort().slice(0, 6).join(",");
  return `${protein}|${keys}`;
}

export function isSimilarRecipe(a: any, b: any): boolean {
  if (normalizeTitle(a?.title ?? "") === normalizeTitle(b?.title ?? "")) return true;
  const sa = recipeSignature(a);
  const sb = recipeSignature(b);
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  // overlap ≥ 4 tokens clés + même protéine → considéré comme variante
  const [pa, ta] = sa.split("|");
  const [pb, tb] = sb.split("|");
  if (pa && pa === pb) {
    const setA = new Set(ta.split(",").filter(Boolean));
    const setB = new Set(tb.split(",").filter(Boolean));
    let overlap = 0;
    for (const t of setA) if (setB.has(t)) overlap += 1;
    if (overlap >= 4) return true;
  }
  return false;
}

/**
 * Construit un indice de goût à partir de l'historique cuisiné : protéines/styles
 * les mieux notés et coups de cœur familial. Sert d'inspiration à l'IA.
 */
function buildTasteHint(history: any[]): string {
  if (!history.length) return "";
  const proteinScore = new Map<string, { sum: number; n: number }>();
  const cuisineScore = new Map<string, { sum: number; n: number }>();
  const loved: string[] = [];
  for (const h of history) {
    const r = h.recipes;
    if (!r) continue;
    const taste = Number(h.taste_rating ?? 0);
    if (r.protein) {
      const k = String(r.protein).toLowerCase();
      const c = proteinScore.get(k) ?? { sum: 0, n: 0 };
      c.sum += taste; c.n += 1; proteinScore.set(k, c);
    }
    if (r.cuisine_style) {
      const k = String(r.cuisine_style).toLowerCase();
      const c = cuisineScore.get(k) ?? { sum: 0, n: 0 };
      c.sum += taste; c.n += 1; cuisineScore.set(k, c);
    }
    if (h.family_loved && r.title) loved.push(r.title);
  }
  const topProteins = [...proteinScore.entries()]
    .map(([k, v]) => [k, v.sum / v.n] as const)
    .filter(([, avg]) => avg >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  const topCuisines = [...cuisineScore.entries()]
    .map(([k, v]) => [k, v.sum / v.n] as const)
    .filter(([, avg]) => avg >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);
  const parts: string[] = [];
  if (topProteins.length) parts.push(`la famille adore les protéines : ${topProteins.join(", ")}`);
  if (topCuisines.length) parts.push(`styles préférés : ${topCuisines.join(", ")}`);
  if (loved.length) parts.push(`coups de cœur passés (s'en inspirer sans les recopier) : ${loved.slice(0, 5).join(", ")}`);
  return parts.length ? `Goûts famille — ${parts.join(" ; ")}` : "";
}

async function generateJson<T>(opts: {
  model: any;
  system: string;
  prompt: string;
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  maxOutputTokens?: number;
}): Promise<T> {
  const { text } = await generateText({
    model: opts.model,
    system: `${opts.system}\n\nCONTRAINTE TECHNIQUE CRITIQUE : réponds uniquement avec UN objet JSON valide. Aucun Markdown, aucune phrase avant/après, aucune virgule finale, aucune clé française.`,
    prompt: opts.prompt,
    temperature: 0.55,
    maxOutputTokens: opts.maxOutputTokens ?? 6000,
  });

  try {
    return opts.schema.parse(extractJsonObject(text));
  } catch (error) {
    console.error("Invalid AI JSON", { error, text: text.slice(0, 1200) });
    throw new Error("L'IA a renvoyé une recette mal formée. Relance la génération.");
  }
}

function normalizeRecipe(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const container = raw as Record<string, any>;
  const r = (container.recipe ?? container.recette ?? container.proposition ?? container) as Record<string, any>;
  const ingredientsSource = r.ingredients ?? r["ingrédients"] ?? r.ingredient_list ?? r.liste_ingredients;
  const ingredients = Array.isArray(ingredientsSource)
    ? ingredientsSource
        .map((ing: any) =>
          typeof ing === "string"
            ? { name: ing, qty: "à ajuster" }
            : {
                name: extractIngredientName(ing),
                qty: String(
                  ing?.qty ?? ing?.quantity ?? ing?.quantite ?? ing?.quantité ?? ing?.amount ?? ing?.dose ?? "à ajuster",
                ).trim(),
              },
        )
        .filter((ing: any) => ing.name)
    : [];
  const stepsSource = r.steps ?? r["étapes"] ?? r.etapes ?? r.instructions ?? r.preparation ?? r.préparation;
  const steps = Array.isArray(stepsSource)
    ? stepsSource
        .map((step: any) =>
          typeof step === "string"
            ? { text: step, timer_minutes: 0 }
            : {
                text: String(step?.text ?? step?.texte ?? step?.instruction ?? step?.description ?? "").trim(),
                timer_minutes: Number(step?.timer_minutes ?? step?.timer ?? step?.duree_minutes ?? step?.durée_minutes ?? step?.minutes ?? 0) || 0,
                appliance_settings: stringifySettings(
                  step?.appliance_settings ?? step?.reglage_appareil ?? step?.réglage_appareil ?? step?.settings ?? step?.parametres,
                ),
              },
        )
        .filter((step: any) => step.text)
    : [];
  const vegetablesSource = r.vegetables ?? r.legumes ?? r["légumes"];
  const vegetables = Array.isArray(vegetablesSource)
    ? vegetablesSource.map(String).filter(Boolean)
    : typeof vegetablesSource === "string"
      ? vegetablesSource.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean)
      : [];
  return {
    title: String(r.title ?? r.titre ?? r.name ?? r.nom ?? "Recette familiale"),
    description: String(r.description ?? r.summary ?? r.resume ?? r.résumé ?? r.title ?? r.titre ?? "Une recette familiale cohérente et savoureuse."),
    cuisine_style: String(r.cuisine_style ?? r.style_cuisine ?? r.cuisine ?? r.origin ?? r.origine ?? "familial").toLowerCase(),
    course_type: (() => {
      const raw = String(r.course_type ?? r.type ?? r.categorie ?? r.catégorie ?? r.course ?? "plat").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (raw.includes("entr")) return "entree";
      if (raw.includes("soup") || raw.includes("velout") || raw.includes("potage")) return "soupe";
      if (raw.includes("dess") || raw.includes("gateau") || raw.includes("patiss")) return "dessert";
      return "plat";
    })(),
    difficulty: ["facile", "moyen", "difficile"].includes(r.difficulty ?? r.difficulte ?? r.difficulté) ? (r.difficulty ?? r.difficulte ?? r.difficulté) : "facile",
    prep_time: Math.max(5, Math.round(Number(r.prep_time ?? r.temps_preparation ?? r.temps_préparation ?? r.preparation_time ?? r.total_time ?? r.temps_total ?? r.cook_time ?? 0)) || 25),
    servings: Number(r.servings ?? r.portions ?? r.personnes ?? 4),
    appliance: String(r.appliance ?? r.appareil ?? r.device ?? "cookeo"),
    protein: String(r.protein ?? r.proteine ?? r.protéine ?? r.main_protein ?? "végétarien").toLowerCase(),
    vegetables,
    calories: Number(r.calories ?? r.kcal ?? 500),
    ingredients,
    steps,
    missing_ingredients: Array.isArray(r.missing_ingredients ?? r.ingredients_manquants)
      ? (r.missing_ingredients ?? r.ingredients_manquants).map(String)
      : [],
  };
}

const recipeBaseSchema = z.object({
  title: z.string(),
  description: z.string(),
  cuisine_style: z.string(),
  course_type: z.enum(["plat", "entree", "soupe", "dessert"]).default("plat"),
  difficulty: z.enum(["facile", "moyen", "difficile"]),
  prep_time: z.number().int().min(5).max(360),
  servings: z.number().int().min(1).max(20),
  appliance: z.string(),
  protein: z.string(),
  vegetables: z.array(z.string()),
  calories: z.number().int().min(50).max(2000),
  ingredients: z.array(z.object({ name: z.string().trim().min(1), qty: z.string().trim().min(1) })).min(2),
  steps: z
    .array(
      z.object({
        text: z.string().trim().min(3),
        timer_minutes: z.number().int().min(0).optional(),
        appliance_settings: z.string().optional(),
      }),
    )
    .min(2),
  missing_ingredients: z.array(z.string()).optional(),
});

type RecipeDto = z.infer<typeof recipeBaseSchema>;

const STYLE_ANCHORS: Record<string, string[]> = {
  marocain: ["ras el hanout", "cumin", "coriandre", "citron confit", "olive", "abricot", "amande", "miel", "safran"],
  oriental: ["cumin", "coriandre", "paprika", "cannelle", "menthe", "citron", "pois chiches", "semoule", "yaourt"],
  asiatique: ["sauce soja", "gingembre", "ail", "sésame", "riz", "nouilles", "coriandre", "citron vert", "oignon nouveau"],
  japonais: ["sauce soja", "mirin", "miso", "sésame", "gingembre", "riz", "nori", "dashi"],
  indien: ["garam masala", "curry", "curcuma", "gingembre", "coriandre", "yaourt", "lait de coco", "riz basmati"],
  italien: ["tomate", "basilic", "origan", "parmesan", "mozzarella", "huile d'olive", "pâtes", "risotto"],
  français: ["beurre", "crème", "moutarde", "thym", "laurier", "échalote", "vin", "champignon", "pomme de terre"],
  mediterraneen: ["huile d'olive", "citron", "origan", "thym", "tomate", "courgette", "aubergine", "feta", "olive"],
  texmex: ["cumin", "paprika fumé", "haricots rouges", "maïs", "tomate", "avocat", "citron vert", "cheddar", "tortilla"],
};

function normalizedText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function validateRecipeQuality(recipe: RecipeDto) {
  const ingredientsText = normalizedText(recipe.ingredients.map((i) => `${i.qty} ${i.name}`).join(" "));
  const fullText = normalizedText([
    recipe.title,
    recipe.description,
    recipe.cuisine_style,
    ingredientsText,
    recipe.steps.map((s) => `${s.text} ${s.appliance_settings ?? ""}`).join(" "),
  ].join(" "));
  const isPlat = recipe.course_type === "plat";
  const minIng = isPlat ? 6 : 4;
  const minSteps = isPlat ? 5 : 3;
  if (recipe.ingredients.length < minIng) throw new Error("Recette trop pauvre : ingrédients insuffisants.");
  if (recipe.steps.length < minSteps) throw new Error("Recette trop pauvre : étapes insuffisantes.");
  if (!recipe.ingredients.some((i) => /\d/.test(i.qty))) throw new Error("Recette incomplète : quantités manquantes.");
  if (!recipe.steps.some((s) => (s.appliance_settings ?? "").trim().length > 8)) {
    throw new Error("Recette incomplète : réglages appareil manquants.");
  }
  if (isPlat) {
    const style = normalizedText(recipe.cuisine_style).replace(/[^a-z0-9]+/g, "");
    const anchors = Object.entries(STYLE_ANCHORS).find(([key]) => style.includes(key.replace(/[^a-z0-9]+/g, "")))?.[1];
    if (anchors) {
      const hits = anchors.filter((anchor) => fullText.includes(normalizedText(anchor))).length;
      if (hits < 2) throw new Error("Recette incohérente : marqueurs culinaires insuffisants.");
    }
  }
  return recipe;
}

const recipeSchema: z.ZodType<RecipeDto, z.ZodTypeDef, unknown> = z.preprocess(
  normalizeRecipe,
  recipeBaseSchema.transform(validateRecipeQuality),
);

function isAiPaymentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const anyError = error as any;
  return message.includes("Payment Required") || anyError?.status === 402 || anyError?.statusCode === 402 || anyError?.response?.status === 402;
}

function applianceSetting(appliance: string, duration: number, temperature = "") {
  const a = appliance.toLowerCase();
  if (a.includes("cookeo")) return `Cookeo Smart Wifi : Rissolage intensité moyen 5 min puis Cuisson sous pression intensité fort ${duration} min, couvercle fermé verrouillé avec au moins 250 ml de liquide`;
  if (a.includes("air")) return `Airfryer : ${temperature || "180°C"}, ${duration} min, panier secoué à mi-cuisson après préchauffage 3 min`;
  if (a.includes("four")) return `Four : chaleur tournante ${temperature || "180°C"}, grille au milieu, ${duration} min après préchauffage`;
  if (a.includes("monsieur")) return `Monsieur Cuisine Smart : mode Sauté vitesse 1 sens inverse 120 °C 6 min puis Mijotage vitesse 1 sens inverse 95 °C ${duration} min`;
  return `${appliance} : feu moyen 5/9 puis doux 3/9, cuisson couverte ${duration} min avec surveillance`;
}

function fallbackRecipe(opts: {
  prompt: string;
  appliance: string;
  servings: number;
  restrictions: string[];
  course_type?: "plat" | "entree" | "soupe" | "dessert";
  variant?: number;
}): RecipeDto & { ai_fallback?: boolean } {
  const course = opts.course_type ?? "plat";
  const vegetarian = opts.restrictions.some((r) => ["vegetarien", "vegetalien"].includes(r));
  const baseProtein = vegetarian ? "légumineuses" : "poulet";
  const variants = [
    { style: "méditerranéen", title: vegetarian ? "Mijoté méditerranéen de lentilles aux légumes" : "Poulet méditerranéen aux légumes fondants", protein: baseProtein, vegetables: ["courgette", "tomate", "poivron"], ingredients: [[vegetarian ? "lentilles vertes" : "poulet", vegetarian ? "320 g" : "600 g"], ["courgettes", "500 g"], ["tomates concassées", "400 g"], ["poivron rouge", "180 g"], ["riz", "300 g"], ["huile d'olive", "30 ml"], ["citron", "40 ml"], ["origan", "2 c. à café"]], minutes: 32 },
    { style: "indien", title: vegetarian ? "Curry de lentilles corail et patate douce" : "Curry de poulet coco aux épinards", protein: baseProtein, vegetables: ["patate douce", "épinards", "tomate"], ingredients: [[vegetarian ? "lentilles corail" : "poulet", vegetarian ? "320 g" : "600 g"], ["patate douce", "500 g"], ["épinards", "200 g"], ["lait de coco", "300 ml"], ["riz basmati", "300 g"], ["curry", "2 c. à café"], ["garam masala", "1 c. à café"], ["gingembre", "15 g"]], minutes: 28 },
    { style: "tex-mex", title: vegetarian ? "Chili doux de haricots rouges et maïs" : "Poulet tex-mex au riz, maïs et tomates", protein: baseProtein, vegetables: ["tomate", "maïs", "poivron"], ingredients: [[vegetarian ? "haricots rouges" : "poulet", vegetarian ? "500 g" : "600 g"], ["maïs", "250 g"], ["tomates concassées", "400 g"], ["poivron", "180 g"], ["riz", "300 g"], ["cumin", "2 c. à café"], ["paprika fumé", "2 c. à café"], ["citron vert", "40 ml"]], minutes: 30 },
  ];
  const v = variants[(opts.variant ?? 0) % variants.length];

  if (course === "dessert") {
    return recipeSchema.parse({
      title: "Pommes fondantes cannelle-citron",
      description: "Un dessert familial simple, fruité et parfumé, avec des pommes moelleuses et un jus légèrement caramélisé.",
      cuisine_style: "familial",
      course_type: "dessert",
      difficulty: "facile",
      prep_time: 25,
      servings: opts.servings,
      appliance: opts.appliance,
      protein: "sans objet",
      vegetables: ["pomme", "citron"],
      calories: 210,
      ingredients: [{ name: "pommes", qty: "800 g" }, { name: "sucre", qty: "50 g" }, { name: "citron", qty: "40 ml" }, { name: "cannelle", qty: "1 c. à café" }, { name: "huile de coco", qty: "20 g" }],
      steps: [{ text: "Couper les pommes en quartiers réguliers et les mélanger avec le citron pour garder une texture fraîche.", timer_minutes: 5, appliance_settings: "Plan de travail : découpe en quartiers de 2 cm" }, { text: "Ajouter le sucre, la cannelle et l'huile de coco, puis mélanger jusqu'à enrobage brillant.", timer_minutes: 3, appliance_settings: "Bol : mélange manuel homogène" }, { text: "Cuire jusqu'à ce que les pommes deviennent tendres et légèrement dorées.", timer_minutes: 18, appliance_settings: applianceSetting(opts.appliance, 18, "180°C") }],
      missing_ingredients: [],
      ai_fallback: true,
    });
  }

  if (course === "soupe" || course === "entree") {
    return recipeSchema.parse({
      title: course === "soupe" ? "Velouté doux de légumes au cumin" : "Salade tiède de légumes citronnés",
      description: course === "soupe" ? "Une soupe douce, parfumée au cumin, avec une texture veloutée et réconfortante." : "Une entrée légère, fraîche et parfumée, avec des légumes tendres relevés au citron.",
      cuisine_style: "méditerranéen",
      course_type: course,
      difficulty: "facile",
      prep_time: 25,
      servings: opts.servings,
      appliance: opts.appliance,
      protein: "végétarien",
      vegetables: ["carotte", "courgette", "tomate"],
      calories: course === "soupe" ? 180 : 220,
      ingredients: [{ name: "carottes", qty: "400 g" }, { name: "courgettes", qty: "400 g" }, { name: "tomates", qty: "250 g" }, { name: "huile d'olive", qty: "25 ml" }, { name: "citron", qty: "30 ml" }, { name: "cumin", qty: "1 c. à café" }],
      steps: [{ text: "Tailler les légumes en morceaux réguliers pour obtenir une cuisson homogène.", timer_minutes: 6, appliance_settings: "Plan de travail : découpe en dés de 2 cm" }, { text: "Faire revenir les légumes avec l'huile d'olive et le cumin jusqu'à ce qu'ils commencent à parfumer.", timer_minutes: 6, appliance_settings: applianceSetting(opts.appliance, 6) }, { text: course === "soupe" ? "Ajouter 700 ml d'eau, cuire jusqu'à tendreté puis mixer finement." : "Cuire juste jusqu'à tendreté puis assaisonner avec citron, sel et poivre.", timer_minutes: 15, appliance_settings: applianceSetting(opts.appliance, 15) }],
      missing_ingredients: [],
      ai_fallback: true,
    });
  }

  return recipeSchema.parse({
    title: v.title,
    description: `Une recette ${v.style} complète, familiale et savoureuse, pensée pour être cuite correctement avec ${opts.appliance}.`,
    cuisine_style: v.style,
    course_type: "plat",
    difficulty: "facile",
    prep_time: v.minutes,
    servings: opts.servings,
    appliance: opts.appliance,
    protein: v.protein,
    vegetables: v.vegetables,
    calories: vegetarian ? 520 : 610,
    ingredients: v.ingredients.map(([name, qty]) => ({ name, qty })),
    steps: [
      { text: "Préparer tous les ingrédients : couper les légumes en morceaux réguliers et sécher la protéine pour une meilleure coloration.", timer_minutes: 8, appliance_settings: "Plan de travail : découpe régulière, morceaux de 2 cm" },
      { text: `Faire revenir la base avec les épices ${v.style} jusqu'à ce que les parfums se développent et que les légumes commencent à fondre.`, timer_minutes: 6, appliance_settings: applianceSetting(opts.appliance, 6) },
      { text: "Ajouter la protéine principale et la saisir jusqu'à légère coloration, en remuant pour bien l'enrober de sauce.", timer_minutes: 7, appliance_settings: applianceSetting(opts.appliance, 7) },
      { text: "Ajouter le liquide ou la sauce, couvrir et laisser cuire jusqu'à ce que la texture soit fondante et la sauce nappante.", timer_minutes: Math.max(12, v.minutes - 18), appliance_settings: applianceSetting(opts.appliance, Math.max(12, v.minutes - 18)) },
      { text: "Cuire l'accompagnement séparément si nécessaire, puis ajuster sel, poivre et acidité avant de servir.", timer_minutes: 10, appliance_settings: "Casserole : eau frémissante feu moyen 6/9, cuisson selon indication du riz" },
    ],
    missing_ingredients: [],
    ai_fallback: true,
  });
}

function buildSystemPrompt(ctx: {
  appliance: string;
  restrictions: string[];
  servings: number;
  family_name?: string | null;
  course_type?: "plat" | "entree" | "soupe" | "dessert";
}) {
  const courseGuides: Record<string, string> = {
    plat: `TYPE DE RECETTE : PLAT PRINCIPAL. Construction = protéine + légumes + accompagnement (féculent ou sauce). Portion généreuse et rassasiante.`,
    entree: `TYPE DE RECETTE : ENTRÉE. Recette légère et raffinée à servir avant le plat : salades composées, tartares, verrines, bouchées, carpaccios, œufs cocotte, terrines, bruschettas… Portion petite (~150-200 g). La "protéine" peut être "légumes", "fromage", "poisson cru", etc. Pas d'accompagnement féculent lourd.`,
    soupe: `TYPE DE RECETTE : SOUPE OU VELOUTÉ. Base liquide (bouillon, lait, crème, lait de coco) + légumes mixés ou en morceaux. Renseigne "protein" avec "légumes" ou la protéine si présente (poulet, lentilles…). Le champ "vegetables" doit lister les légumes principaux. Sers en bol (~300-400 ml par personne). Étapes : suer les aromates, ajouter légumes + liquide, cuire, mixer si velouté, ajuster assaisonnement, garniture finale (croûtons, herbes, crème, huile parfumée).`,
    dessert: `TYPE DE RECETTE : DESSERT. Sucré, gourmand, équilibré : crumbles, mousses, panna cotta, tartes, gâteaux, fruits rôtis, compotes, riz au lait, clafoutis, tiramisu, brownies… Renseigne "protein" avec "sans objet" ou l'ingrédient star ("chocolat", "fruits", "fromage blanc"). "vegetables" peut rester vide ou lister fruits. Ne mets PAS de protéine animale type viande/poisson. Précise températures de cuisson, repos au frais éventuel, dressage.`,
  };
  const courseGuide = courseGuides[ctx.course_type ?? "plat"];
  return `Tu es un chef cuisinier français créatif et précis qui assiste la famille ${
    ctx.family_name ?? ""
  }.
${courseGuide}
Règles ABSOLUES :
- La recette DOIT avoir une identité culinaire claire (français, italien, oriental, asiatique, méditerranéen, tex-mex, libanais, indien, japonais...). Tous les ingrédients, épices, sauces et accompagnements doivent appartenir à ce style. Aucune association incohérente.
- Avant d'écrire la recette, choisis mentalement un "territoire culinaire" précis et respecte son ADN :
  * tajine marocain = ras el hanout/cumin/coriandre, citron confit ou olives ou fruits secs, légumes fondants, sauce courte parfumée ; jamais sauce soja, curry japonais ou cheddar.
  * wok asiatique = sauce soja/gingembre/ail/sésame/citron vert, légumes croquants, cuisson très vive ; jamais crème, herbes de Provence ou fromage.
  * gratin français = crème ou béchamel ou fromage, ail/muscade/thym, légumes adaptés ; jamais mélange tex-mex/asiatique.
  * méditerranéen = huile d'olive, citron, herbes, tomate/courgette/aubergine/poivron, olives/feta possible.
  * tex-mex = cumin/paprika fumé, tomate, haricots/maïs, citron vert, coriandre, tortilla ou riz.
- Si l'utilisateur demande un plat précis (tajine, wok, gratin, curry, risotto...), respecte les codes de CE plat. Ne transforme pas en assemblage générique.
- Les légumes doivent s'accorder naturellement avec la protéine et le style.
- La recette doit donner envie et être savoureuse, pas une simple liste d'ingrédients.
- Renseigne "protein" avec la protéine principale en UN SEUL MOT SIMPLE choisi STRICTEMENT dans cette liste fermée : poulet, dinde, veau, boeuf, agneau, porc, canard, lapin, poisson, fruits de mer, oeufs, tofu, légumineuses, fromage, végétarien. JAMAIS d'autre valeur, jamais de qualificatif ("blanc de", "haché", "filet de", etc.).
- Renseigne "vegetables" avec la liste des légumes utilisés (3 à 6 entrées, nom simple en minuscules).
- Renseigne "calories" : estimation honnête des kcal par portion.
- "prep_time" = temps TOTAL réaliste en minutes (préparation + cuisson). Il DOIT varier selon la recette : un tartare = 10-15 min, un sauté wok = 15-20 min, une poêlée = 20-25 min, un mijoté Cookeo = 25-40 min, un rôti four = 45-90 min, un bourguignon = 90-180 min. N'utilise JAMAIS une valeur par défaut, calcule honnêtement.
- QUANTITÉS : exprime TOUJOURS les quantités en grammes ("g") pour les solides et en millilitres ("ml") pour les liquides. Format strict du champ "qty" = "<nombre> <unité>" (ex : "200 g", "150 ml", "30 g"). N'utilise "c. à soupe", "c. à café", "pincée", "gousse", "tranche", "unité" QUE pour les ingrédients impossibles à peser (sel, épices, ail). Pour les œufs : "<nombre> unités" (ex : "2 unités"). Jamais de plage ("100-150 g"), donne UNE valeur précise.
- Préférences alimentaires à respecter ABSOLUMENT (aucun ingrédient interdit) : ${
    ctx.restrictions.length ? ctx.restrictions.join(", ") : "aucune"
  }.
- Portions : ${ctx.servings} personnes.
- Appareil de cuisson : ${ctx.appliance}. Pour CHAQUE étape de cuisson, renseigne le champ "appliance_settings" avec **le mode ET l'intensité précise** pour guider l'utilisateur :
  * Cookeo Smart Wifi : nomme EXACTEMENT le programme officiel : "Rissolage" (et non "Dorer"), "Mijotage", "Cuisson sous pression", "Cuisson vapeur", "Réchauffage", "Maintien au chaud", "Manuel". Pour Rissolage, Mijotage et Cuisson sous pression, précise TOUJOURS l'intensité : **doux**, **moyen** ou **fort** (ex : "Rissolage intensité moyen 5 min", "Cuisson sous pression intensité fort 15 min", "Mijotage intensité doux 25 min"). Indique le couvercle (ouvert pour rissolage, fermé verrouillé pour pression) et le liquide minimum requis pour la pression (≥ 250 ml).
  * Monsieur Cuisine Smart (Lidl) : précise programme/mode (Pétrissage, Mijotage, Vapeur Varoma, Sauté, Sous-vide, Fermentation, ou Manuel), **vitesse 1 à 10** (ou Turbo), **température en °C** (37–130 °C, ou "Varoma" pour la vapeur), **durée**, et **sens des pales** (normal ou inverse pour préserver les morceaux). Ex : "Mode Sauté, vitesse 1 sens inverse, 120 °C, 8 min" ou "Vapeur Varoma, vitesse 2, 20 min".
  * Airfryer : température °C (160–200 °C) + durée + "secouer le panier à mi-cuisson" + préchauffage 3 min si applicable.
  * Four : préchauffage + mode (chaleur tournante / statique / grill) + température °C + position grille (bas / milieu / haut) + durée.
  * Cocotte-minute : feu vif jusqu'à sifflement de la soupape, puis feu doux + durée après mise en pression + libération vapeur (rapide / naturelle).
  * Poêle : intensité feu (vif 8/9, moyen 5/6, doux 3/4) + matière grasse + durée par face.
  * Wok : feu très vif (9/9) + huile fumante + saisie courte par poignée d'ingrédients (1–2 min).
  * Casserole : intensité (vif/moyen/doux + chiffre 1–9 si plaque) + couvert ou non + durée.
  * Plancha : température (180–250 °C) + durée par face.
  N'écris JAMAIS "cuire à feu moyen" sans préciser l'intensité chiffrée ou la température. N'invente JAMAIS de programme inexistant (ex : "Dorer" sur Cookeo Smart Wifi = utilise "Rissolage").
- ÉTAPES DÉTAILLÉES : produis 6 à 10 étapes, chacune en 1–3 phrases. Décris le geste (couper en cubes de 2 cm, émincer finement, mélanger jusqu'à liaison…), l'indice visuel/sonore de réussite (jusqu'à coloration dorée, jusqu'à ce que l'oignon devienne translucide, jusqu'au sifflement…), et toute astuce utile (déglacer, gratter les sucs, racler les bords de la cuve…). Évite les étapes vagues type "faire cuire" sans contexte.
- La liste d'ingrédients doit contenir la protéine/légumineuse principale, 2 à 4 légumes cohérents, la base aromatique, les épices/herbes du style, le liquide ou la sauce, l'accompagnement si nécessaire. Minimum 7 ingrédients utiles hors sel/poivre/eau.
- La description doit expliquer le goût du plat (sauce, parfum, texture) et pas seulement répéter le titre.
- Étapes claires, numérotées implicitement, avec timer en minutes quand il y a une cuisson minutée.
- Tout doit être en français.
- FORMAT DE SORTIE STRICT : un seul objet JSON avec EXACTEMENT ces clés racines en anglais : title, description, cuisine_style, course_type, difficulty, prep_time, servings, appliance, protein, vegetables, calories, ingredients, steps, missing_ingredients. Le champ "course_type" DOIT valoir exactement "${ctx.course_type ?? "plat"}". Dans ingredients, chaque entrée = {"name":"...","qty":"..."}. Dans steps, chaque entrée = {"text":"...","timer_minutes":0,"appliance_settings":"..."}. N'utilise jamais les clés françaises "titre", "ingrédients", "étapes", "quantité".`;
}

const generateInput = z.object({
  prompt: z.string().min(2).max(500),
  appliance: z.string().min(2).max(50),
  servings: z.number().int().min(1).max(20).optional(),
});

export const generateRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => generateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Clé Lovable AI manquante");

    const [profile, prefs] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
    ]);
    const restrictions = (prefs.data ?? []).map((p) => p.restriction);
    const servings = data.servings ?? profile.data?.household_size ?? 4;
    const family_name = profile.data?.family_name;

    const recipe = await (async () => {
      try {
        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-2.5-flash");
        return await generateJson({
          model,
          system: buildSystemPrompt({ appliance: data.appliance, restrictions, servings, family_name }),
          prompt: `Génère une recette complète pour : ${data.prompt}`,
          schema: recipeSchema,
        });
      } catch (error) {
        if (isAiPaymentError(error)) return fallbackRecipe({ prompt: data.prompt, appliance: data.appliance, servings, restrictions });
        throw error;
      }
    })();
    return { ...recipe, appliance: data.appliance };
  });

// Helper réutilisable côté serveur (chat IA "Leia", etc.)
export async function generateRecipeForUser(opts: {
  userId: string;
  prompt: string;
  appliance: string;
}) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Clé Lovable AI manquante");
  const [profile, prefs] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").eq("id", opts.userId).maybeSingle(),
    supabaseAdmin.from("dietary_preferences").select("restriction").eq("user_id", opts.userId),
  ]);
  const restrictions = (prefs.data ?? []).map((p) => p.restriction);
  const servings = profile.data?.household_size ?? 4;
  const family_name = profile.data?.family_name ?? null;
  const recipe = await (async () => {
    try {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway("google/gemini-2.5-flash");
      return await generateJson({
        model,
        system: buildSystemPrompt({ appliance: opts.appliance, restrictions, servings, family_name }),
        prompt: `Génère une recette complète pour : ${opts.prompt}`,
        schema: recipeSchema,
      });
    } catch (error) {
      if (isAiPaymentError(error)) return fallbackRecipe({ prompt: opts.prompt, appliance: opts.appliance, servings, restrictions });
      throw error;
    }
  })();
  return { ...recipe, appliance: opts.appliance };
}

// Public — generate without account (guest mode)
export const generateRecipePublic = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    generateInput.extend({ restrictions: z.array(z.string()).max(20).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Clé Lovable AI manquante");
    const recipe = await (async () => {
      try {
        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-2.5-flash");
        return await generateJson({
          model,
          system: buildSystemPrompt({
            appliance: data.appliance,
            restrictions: data.restrictions ?? [],
            servings: data.servings ?? 4,
            family_name: null,
          }),
          prompt: `Génère une recette complète pour : ${data.prompt}`,
          schema: recipeSchema,
        });
      } catch (error) {
        if (isAiPaymentError(error)) return fallbackRecipe({ prompt: data.prompt, appliance: data.appliance, servings: data.servings ?? 4, restrictions: data.restrictions ?? [] });
        throw error;
      }
    })();
    return { ...recipe, appliance: data.appliance };
  });

const saveSchema = recipeBaseSchema.extend({
  photo_url: z.string().optional(),
  source: z.string().default("ai"),
});

const batchSchema = z.object({ recipes: z.array(recipeSchema).min(3).max(4) });

const batchInput = z.object({
  appliance: z.string().min(2).max(50),
  servings: z.number().int().min(1).max(20).optional(),
  restrictions: z.array(z.string()).max(20).optional(),
  exclude: z.array(z.string()).max(40).optional(),
  hint: z.string().max(300).optional(),
  course_type: z.enum(["plat", "entree", "soupe", "dessert"]).optional(),
});

function buildBatchPrompt(exclude: string[], hint?: string, courseType: "plat" | "entree" | "soupe" | "dessert" = "plat") {
  const courseLabel = { plat: "plats principaux", entree: "entrées", soupe: "soupes ou veloutés", dessert: "desserts" }[courseType];
  const platRules = courseType === "plat"
    ? `- PROTÉINES : pas plus de 2 recettes avec la même protéine principale parmi les 3. Varie au maximum.`
    : `- Varie les ingrédients vedettes : pas deux recettes construites sur le même ingrédient principal.`;
  return `Propose 3 ${courseLabel} VARIÉS et savoureux pour la famille.
Contraintes :
- Chaque recette doit avoir une identité culinaire claire et différente des autres autant que possible (varie les styles : ex. un français, un asiatique, un méditerranéen).
${platRules}
- Chaque recette doit être cohérente et bien construite pour son type (${courseLabel}).
- "course_type" DOIT valoir "${courseType}" pour les 3 recettes.
- Évite ces titres déjà vus : ${exclude.length ? exclude.join(", ") : "aucun"}.
${hint ? `- Préférence utilisateur : ${hint}` : ""}
Réponds avec un objet { recipes: [3 recettes complètes] }.`;
}

async function generateBatchOnce(opts: {
  apiKey: string;
  appliance: string;
  restrictions: string[];
  servings: number;
  family_name: string | null;
  exclude: string[];
  hint?: string;
  course_type?: "plat" | "entree" | "soupe" | "dessert";
}) {
  const object = await (async () => {
    try {
      const gateway = createLovableAiGatewayProvider(opts.apiKey);
      const model = gateway("google/gemini-2.5-flash");
      return await generateJson({
        model,
        system: buildSystemPrompt({
          appliance: opts.appliance,
          restrictions: opts.restrictions,
          servings: opts.servings,
          family_name: opts.family_name,
          course_type: opts.course_type,
        }),
        prompt: buildBatchPrompt(opts.exclude, opts.hint, opts.course_type),
        schema: batchSchema,
        maxOutputTokens: 9000,
      });
    } catch (error) {
      if (isAiPaymentError(error)) {
        return { recipes: [0, 1, 2].map((variant) => fallbackRecipe({ prompt: opts.hint ?? "recette familiale", appliance: opts.appliance, servings: opts.servings, restrictions: opts.restrictions, course_type: opts.course_type, variant })) };
      }
      throw error;
    }
  })();
  if ((opts.course_type ?? "plat") === "plat") {
    const counts: Record<string, number> = {};
    const kept: typeof object.recipes = [];
    for (const r of object.recipes) {
      const p = (r.protein ?? "").toLowerCase().trim();
      counts[p] = (counts[p] ?? 0) + 1;
      if (counts[p] <= 2) kept.push(r);
    }
    return kept;
  }
  return object.recipes;
}

export const generateRecipeBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => batchInput.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Clé Lovable AI manquante");

    const { supabase, userId } = context;
    const [profile, prefs] = await Promise.all([
      supabase.from("profiles").select("family_name, household_size").eq("id", userId).maybeSingle(),
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
    ]);
    const dbRestrictions = (prefs.data ?? []).map((p) => p.restriction);
    const restrictions = Array.from(new Set([...(data.restrictions ?? []), ...dbRestrictions]));
    const servings = data.servings ?? profile.data?.household_size ?? 4;
    const family_name = profile.data?.family_name ?? null;
    const { data: existing } = await supabase
      .from("recipes")
      .select("title, protein, vegetables, ingredients")
      .eq("owner_id", userId)
      .limit(300);
    const existingTitles = (existing ?? []).map((r) => r.title);
    const existingNorm = new Set(existingTitles.map(normalizeTitle));
    const existingSigs = new Set((existing ?? []).map((r: any) => recipeSignature(r)).filter(Boolean));
    const exclude = Array.from(new Set([...(data.exclude ?? []), ...existingTitles]));
    const isDuplicate = (r: any) =>
      existingNorm.has(normalizeTitle(r.title)) || existingSigs.has(recipeSignature(r));

    // Inspiration : on récupère les recettes les mieux notées par la famille
    // pour guider l'IA vers leurs goûts (sans copier les titres existants).
    const { data: cooked } = await supabase
      .from("cooked_history")
      .select("taste_rating, family_loved, recipes(title, protein, cuisine_style)")
      .eq("user_id", userId)
      .order("cooked_at", { ascending: false })
      .limit(40);
    const tasteHint = buildTasteHint(cooked ?? []);
    const combinedHint = [data.hint, tasteHint].filter(Boolean).join(" — ");

    const unique: any[] = [];
    let currentExclude = [...exclude];
    for (let attempt = 0; attempt < 3 && unique.length < 3; attempt += 1) {
      const kept = await generateBatchOnce({
        apiKey,
        appliance: data.appliance,
        restrictions,
        servings,
        family_name,
        exclude: currentExclude,
        hint: combinedHint || undefined,
        course_type: data.course_type,
      });
      const valid = kept.filter(
        (r) => violatesRestrictions(r, restrictions).length === 0 && !isDuplicate(r),
      );
      for (const r of valid) {
        if (unique.length >= 3) break;
        if (unique.some((k) => isSimilarRecipe(k, r))) continue;
        unique.push(r);
        currentExclude.push(r.title);
      }
    }
    return unique.slice(0, 3);
  });

export const deleteRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("favorites").delete().eq("recipe_id", data.id).eq("user_id", userId);
    const { error } = await supabase
      .from("recipes")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Régénère uniquement les étapes (texte + appliance_settings + timer) d'une recette
// existante en respectant les nouvelles règles de précision appareil.
const stepsOnlySchema = z.object({
  prep_time: z.number().int().min(5).max(360).optional(),
  steps: z
    .array(
      z.object({
        text: z.string().min(3),
        timer_minutes: z.number().int().min(0).optional(),
        appliance_settings: z.string().optional(),
      }),
    )
    .min(4),
});

export const refreshRecipeSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Clé Lovable AI manquante");

    const { data: recipe, error } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", data.id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!recipe) throw new Error("Recette introuvable");

    const [profile, prefs] = await Promise.all([
      supabase.from("profiles").select("family_name, household_size").eq("id", userId).maybeSingle(),
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
    ]);
    const restrictions = (prefs.data ?? []).map((p) => p.restriction);
    const servings = recipe.servings ?? profile.data?.household_size ?? 4;
    const appliance = recipe.appliance ?? "cookeo";

    const result = await (async () => {
      try {
        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-2.5-flash");
        return await generateJson({
          model,
          system: buildSystemPrompt({
            appliance,
            restrictions,
            servings,
            family_name: profile.data?.family_name ?? null,
          }),
          prompt: `Voici une recette EXISTANTE. Réécris UNIQUEMENT les étapes en suivant strictement les règles "ÉTAPES DÉTAILLÉES" et "appliance_settings" (mode officiel + intensité chiffrée/température, 6 à 10 étapes, gestes précis, indices de réussite). Ne change ni le titre, ni les ingrédients, ni la protéine. Conserve la cohérence avec la liste d'ingrédients fournie.

Recette : ${recipe.title}
Style : ${recipe.cuisine_style ?? ""}
Appareil : ${appliance}
Portions : ${servings}
Ingrédients : ${JSON.stringify(recipe.ingredients ?? [])}

Réponds en JSON strict :
{ "prep_time": <minutes réalistes>, "steps": [ { "text": "...", "timer_minutes": 0, "appliance_settings": "..." }, ... ] }`,
          schema: stepsOnlySchema,
          maxOutputTokens: 4000,
        });
      } catch (error) {
        if (isAiPaymentError(error)) {
          return {
            prep_time: recipe.prep_time,
            steps: Array.isArray(recipe.steps) && recipe.steps.length >= 4
              ? recipe.steps
              : fallbackRecipe({ prompt: recipe.title, appliance, servings, restrictions }).steps,
          };
        }
        throw error;
      }
    })();

    const { error: updErr } = await supabase
      .from("recipes")
      .update({
        steps: result.steps,
        prep_time: result.prep_time ?? recipe.prep_time,
      })
      .eq("id", recipe.id)
      .eq("owner_id", userId);
    if (updErr) throw new Error(updErr.message);
    return { id: recipe.id, steps: result.steps };
  });

export const listRecipeIdsForRefresh = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("recipes")
      .select("id, title")
      .eq("owner_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ============== IMPORT (URL / PHOTO) ==============

function stripHtml(html: string): string {
  // Supprime scripts/styles, garde le texte lisible
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

export const importRecipeFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        url: z.string().url().max(800),
        appliance: z.string().min(2).max(50).default("cookeo"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Clé Lovable AI manquante");

    let html = "";
    try {
      const res = await fetch(data.url, {
        headers: { "user-agent": "Mozilla/5.0 MiamPlan/1.0", accept: "text/html,*/*" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch (e: any) {
      throw new Error(`Impossible de récupérer la page : ${e.message}`);
    }
    const text = stripHtml(html);
    if (text.length < 200) throw new Error("Le contenu de cette page est trop court ou inaccessible.");

    const [profile, prefs] = await Promise.all([
      supabase.from("profiles").select("family_name, household_size").eq("id", userId).maybeSingle(),
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
    ]);
    const restrictions = (prefs.data ?? []).map((p) => p.restriction);
    const servings = profile.data?.household_size ?? 4;

    try {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway("google/gemini-2.5-flash");
      return await generateJson({
        model,
        system: `${buildSystemPrompt({ appliance: data.appliance, restrictions, servings, family_name: profile.data?.family_name ?? null })}

TÂCHE SPÉCIALE — IMPORT DEPUIS UNE PAGE WEB :
- Extrais titre, ingrédients, étapes depuis le texte fourni.
- Convertis TOUTES les quantités en grammes/millilitres (estimation raisonnable si la recette donne "1 oignon" → "120 g d'oignon", "1 cuillère d'huile" → "10 ml").
- ADAPTE les étapes à l'appareil ${data.appliance} en suivant strictement les règles "ÉTAPES DÉTAILLÉES" et "appliance_settings".
- AJUSTE les quantités pour ${servings} personnes.
- Si la page contient plusieurs recettes, prends la principale.`,
        prompt: `URL : ${data.url}\n\nContenu :\n${text}`,
        schema: recipeSchema,
        maxOutputTokens: 6000,
      });
    } catch (error) {
      if (isAiPaymentError(error)) return fallbackRecipe({ prompt: "recette importée", appliance: data.appliance, servings, restrictions });
      throw error;
    }
  });

export const importRecipeFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        // data URL base64 : data:image/jpeg;base64,xxxx
        image_data_url: z.string().min(50).max(7_000_000),
        appliance: z.string().min(2).max(50).default("cookeo"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Clé Lovable AI manquante");

    const [profile, prefs] = await Promise.all([
      supabase.from("profiles").select("family_name, household_size").eq("id", userId).maybeSingle(),
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
    ]);
    const restrictions = (prefs.data ?? []).map((p) => p.restriction);
    const servings = profile.data?.household_size ?? 4;

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");

    const { text } = await generateText({
      model,
      system: `${buildSystemPrompt({ appliance: data.appliance, restrictions, servings, family_name: profile.data?.family_name ?? null })}

TÂCHE SPÉCIALE — IMPORT DEPUIS UNE PHOTO DE RECETTE (livre, magazine, écran) :
- Lis le texte visible (titre, ingrédients, étapes). Fais de l'OCR si nécessaire.
- Convertis TOUTES les quantités en grammes/millilitres (estimation raisonnable si nécessaire).
- ADAPTE les étapes à l'appareil ${data.appliance} en suivant strictement les règles "ÉTAPES DÉTAILLÉES" et "appliance_settings".
- AJUSTE pour ${servings} personnes.

Réponds uniquement avec du JSON valide, sans Markdown.`,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Extrais et structure la recette visible sur cette photo, adaptée pour ${servings} personnes et l'appareil ${data.appliance}.` },
            { type: "image", image: data.image_data_url },
          ],
        },
      ],
      temperature: 0.4,
      maxOutputTokens: 6000,
    });

    try {
      return recipeSchema.parse(JSON.parse(text.replace(/```json|```/gi, "").trim().replace(/^[^{]*/, "").replace(/[^}]*$/, "")));
    } catch {
      // fallback : extract first {...} block
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("L'IA n'a pas réussi à lire la recette. Essaie une photo plus nette.");
      return recipeSchema.parse(JSON.parse(text.slice(start, end + 1)));
    }
  });

export const saveRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ recipes: z.array(saveSchema).min(1).max(10) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = data.recipes.map(({ missing_ingredients, ...r }) => ({ ...r, owner_id: userId, source: "ai" }));
    const { data: inserted, error } = await supabase.from("recipes").insert(rows).select();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const saveRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { missing_ingredients, ...rest } = data;
    const { data: row, error } = await supabase
      .from("recipes")
      .insert({ ...rest, owner_id: userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listRecipes = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { search?: string; protein?: string; cuisine?: string; maxTime?: number } | undefined) =>
      input ?? {},
  )
  .handler(async ({ data }) => {
    let query = supabaseAdmin
      .from("recipes")
      .select(
        "id, title, photo_url, cuisine_style, difficulty, prep_time, source, description, protein, vegetables, calories, appliance",
      )
      .eq("source", "seed")
      .order("created_at", { ascending: false })
      .limit(60);
    if (data?.search) query = query.ilike("title", `%${data.search}%`);
    if (data?.protein) query = query.ilike("protein", `%${data.protein}%`);
    if (data?.cuisine) query = query.ilike("cuisine_style", `%${data.cuisine}%`);
    if (data?.maxTime) query = query.lte("prep_time", data.maxTime);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMyRecipes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input:
      | {
          search?: string;
          protein?: string;
          cuisine?: string;
          appliance?: string;
          maxTime?: number;
          sort?: "recent" | "rated" | "loved" | "todo";
          course_type?: string;
        }
      | undefined) =>
      input ?? {},
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let query = supabase
      .from("recipes")
      .select(
        "id, title, photo_url, cuisine_style, course_type, difficulty, prep_time, source, description, protein, vegetables, calories, appliance",
      )
      .eq("owner_id", userId)
      .limit(120);
    if (data?.search) {
      const q = `%${data.search}%`;
      // recherche full-text simple sur les champs texte
      query = query.or(
        `title.ilike.${q},description.ilike.${q},protein.ilike.${q},cuisine_style.ilike.${q}`,
      );
    }
    if (data?.protein) query = query.ilike("protein", `%${data.protein}%`);
    if (data?.cuisine) query = query.ilike("cuisine_style", `%${data.cuisine}%`);
    if (data?.appliance) query = query.eq("appliance", data.appliance);
    if (data?.course_type) query = query.eq("course_type", data.course_type);
    if (data?.maxTime) query = query.lte("prep_time", data.maxTime);
    const { data: rows, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    let recipes = rows ?? [];
    // Recherche élargie (ingrédients + légumes) — fait via une 2e requête pour les recettes
    // dont le texte ne matchait pas le titre/description.
    if (data?.search) {
      const term = data.search.toLowerCase();
      const { data: extra } = await supabase
        .from("recipes")
        .select(
          "id, title, photo_url, cuisine_style, difficulty, prep_time, source, description, protein, vegetables, calories, ingredients",
        )
        .eq("owner_id", userId)
        .limit(120);
      const matchExtra = (extra ?? []).filter((r: any) => {
        const vegHit = (r.vegetables ?? []).some((v: string) => v?.toLowerCase().includes(term));
        const ingHit = Array.isArray(r.ingredients)
          ? r.ingredients.some((i: any) => (i?.name ?? "").toLowerCase().includes(term))
          : false;
        return vegHit || ingHit;
      });
      const known = new Set(recipes.map((r) => r.id));
      for (const r of matchExtra) {
        if (!known.has(r.id)) {
          const { ingredients, ...rest } = r as any;
          recipes.push(rest);
        }
      }
    }
    if (!recipes.length) return [];

    // Récupère les notes (cooked_history) pour ces recettes
    const ids = recipes.map((r) => r.id);
    const { data: history } = await supabase
      .from("cooked_history")
      .select("recipe_id, taste_rating, ease_rating, family_loved, cooked_at")
      .eq("user_id", userId)
      .in("recipe_id", ids);

    const stats = new Map<
      string,
      { taste: number; ease: number; cooked: number; loved: boolean; lastCookedAt: string | null }
    >();
    for (const h of history ?? []) {
      const s = stats.get(h.recipe_id) ?? { taste: 0, ease: 0, cooked: 0, loved: false, lastCookedAt: null };
      s.taste += Number(h.taste_rating ?? 0);
      s.ease += Number(h.ease_rating ?? 0);
      s.cooked += 1;
      s.loved = s.loved || !!h.family_loved;
      if (!s.lastCookedAt || (h.cooked_at && h.cooked_at > s.lastCookedAt)) {
        s.lastCookedAt = h.cooked_at ?? null;
      }
      stats.set(h.recipe_id, s);
    }

    const enriched = recipes.map((r) => {
      const s = stats.get(r.id);
      const cooked = s?.cooked ?? 0;
      return {
        ...r,
        cooked_count: cooked,
        avg_taste: s && cooked ? Math.round((s.taste / cooked) * 10) / 10 : null,
        avg_ease: s && cooked ? Math.round((s.ease / cooked) * 10) / 10 : null,
        family_loved: s?.loved ?? false,
        last_cooked_at: s?.lastCookedAt ?? null,
      };
    });

    const sort = data?.sort ?? "recent";
    if (sort === "rated") {
      enriched.sort((a, b) => (b.avg_taste ?? -1) - (a.avg_taste ?? -1));
    } else if (sort === "loved") {
      enriched.sort((a, b) => Number(b.family_loved) - Number(a.family_loved) || (b.avg_taste ?? -1) - (a.avg_taste ?? -1));
    } else if (sort === "todo") {
      // jamais cuisinées d'abord, sinon les plus anciennement cuisinées
      enriched.sort((a, b) => {
        if (a.cooked_count === 0 && b.cooked_count > 0) return -1;
        if (b.cooked_count === 0 && a.cooked_count > 0) return 1;
        const al = a.last_cooked_at ?? "";
        const bl = b.last_cooked_at ?? "";
        return al.localeCompare(bl);
      });
    }
    return enriched;
  });

export const getRecipe = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("recipes")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ recipe_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("favorites")
      .select("*")
      .eq("user_id", userId)
      .eq("recipe_id", data.recipe_id)
      .maybeSingle();
    if (existing) {
      await supabase.from("favorites").delete().eq("user_id", userId).eq("recipe_id", data.recipe_id);
      return { favorited: false };
    }
    await supabase.from("favorites").insert({ user_id: userId, recipe_id: data.recipe_id });
    return { favorited: true };
  });

export const listFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("favorites")
      .select("recipe_id, recipes(*)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.recipes).filter(Boolean);
  });

export const getUserStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [favs, cooked, prefs] = await Promise.all([
      supabase.from("favorites").select("recipe_id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("cooked_history").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
    ]);
    return {
      favorites: favs.count ?? 0,
      cooked: cooked.count ?? 0,
      restrictions: (prefs.data ?? []).map((p) => p.restriction),
    };
  });

export const listCollections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("collections")
      .select("id, name, collection_recipes(recipe_id)")
      .eq("user_id", userId)
      .order("created_at");
    return data ?? [];
  });

export const createCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("collections")
      .insert({ user_id: userId, name: data.name })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });