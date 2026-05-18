import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import { generateText } from "ai";
import { violatesRestrictions, normalizeTitle, recipeSignature, isSimilarRecipe } from "./recipes.functions";


function extractJsonObject(text: string) {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Réponse IA invalide : aucun JSON détecté");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function generateJson<T>(opts: {
  model: any;
  system: string;
  prompt: string;
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  maxOutputTokens?: number;
}) {
  const { text } = await generateText({
    model: opts.model,
    system: `${opts.system}\n\nCONTRAINTE TECHNIQUE CRITIQUE : réponds uniquement avec UN objet JSON valide. Aucun Markdown, aucune phrase avant/après, aucune virgule finale, aucune clé française.`,
    prompt: opts.prompt,
    temperature: 0.45,
    maxOutputTokens: opts.maxOutputTokens ?? 5000,
  });

  try {
    return opts.schema.parse(extractJsonObject(text));
  } catch (error) {
    console.error("Invalid AI JSON", { error, text: text.slice(0, 1200) });
    throw new Error("L'IA a renvoyé une réponse mal formée. Relance la génération.");
  }
}

// ============== FRIDGE ==============

export const listFridge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("fridge_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addFridgeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ name: z.string().min(1).max(80), qty: z.string().max(40).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("fridge_items")
      .insert({ user_id: userId, name: data.name, qty: data.qty ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeFridgeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("fridge_items").delete().eq("id", data.id).eq("user_id", userId);
    return { ok: true };
  });

function splitList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;\n]/).map((v) => v.trim()).filter(Boolean);
  return [];
}

function extractIngredientName(ing: any): string {
  const direct =
    ing?.name ?? ing?.nom ?? ing?.ingredient ?? ing?.ingrédient ?? ing?.aliment ?? ing?.produit ?? ing?.item ?? ing?.label ?? ing?.libelle ?? ing?.libellé ?? ing?.nom_ingredient ?? ing?.nomIngredient;
  if (direct && typeof direct === "string" && direct.trim()) return direct.trim();
  if (direct && typeof direct === "object") {
    const inner = direct?.name ?? direct?.nom ?? direct?.text;
    if (inner) return String(inner).trim();
  }
  // Fallback : 1ʳᵉ valeur string non vide (hors qty/quantity)
  if (ing && typeof ing === "object") {
    for (const [k, v] of Object.entries(ing)) {
      if (/qty|quantit|amount|dose|unit|gram|ml|kcal|calor/i.test(k)) continue;
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

function stringifySettings(value: any): string | undefined {
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

function normalizeFridgeRecipe(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, any>;
  const ingredientsSource = r.ingredients ?? r["ingrédients"] ?? r.liste_ingredients ?? [];
  const ingredients = Array.isArray(ingredientsSource)
    ? ingredientsSource.map((ing: any) =>
        typeof ing === "string"
          ? { name: ing, qty: "à ajuster" }
          : {
              name: extractIngredientName(ing),
              qty: String(
                ing?.qty ?? ing?.quantity ?? ing?.quantite ?? ing?.quantité ?? ing?.amount ?? ing?.dose ?? "à ajuster",
              ),
            },
      )
        .filter((ing: any) => ing.name && ing.name.length > 0)
    : [];
  const stepsSource = Array.isArray(r.steps) ? r.steps : Array.isArray(r.instructions) ? r.instructions : Array.isArray(r.etapes) ? r.etapes : [];
  const steps = stepsSource.map((step: any) =>
    typeof step === "string"
      ? { text: step, timer_minutes: 0 }
      : {
          text: String(step?.text ?? step?.texte ?? step?.instruction ?? step?.description ?? ""),
          timer_minutes: Number(step?.timer_minutes ?? step?.timer ?? step?.minutes ?? 0) || 0,
          appliance_settings: stringifySettings(
            step?.appliance_settings ?? step?.reglage_appareil ?? step?.réglage_appareil ?? step?.settings ?? step?.parametres,
          ),
        },
  );

  return {
    title: String(r.title ?? r.name ?? "Recette du frigo"),
    description: String(r.description ?? r.summary ?? r.title ?? "Une recette cohérente avec les ingrédients disponibles."),
    cuisine_style: String(r.cuisine_style ?? r.cuisine ?? r.origin ?? "familial").toLowerCase(),
    difficulty: ["facile", "moyen", "difficile"].includes(r.difficulty) ? r.difficulty : "facile",
    prep_time: Math.max(5, Math.round(Number(r.prep_time ?? r.preparation_time ?? r.total_time ?? r.cook_time ?? 25)) || 25),
    servings: Math.max(1, Math.round(Number(r.servings ?? r.portions ?? 4)) || 4),
    appliance: String(r.appliance ?? r.device ?? "cookeo"),
    protein: String(r.protein ?? r.proteine ?? r.main_protein ?? "végétarien").toLowerCase(),
    vegetables: splitList(r.vegetables ?? r.legumes ?? r["légumes"]),
    calories: Math.max(50, Math.round(Number(r.calories ?? r.kcal ?? 500)) || 500),
    ingredients,
    steps,
    missing_ingredients: splitList(r.missing_ingredients ?? r.to_buy ?? r.a_acheter),
  };
}

const fridgeRecipeBaseSchema = z.object({
  title: z.string(),
  description: z.string(),
  cuisine_style: z.string(),
  difficulty: z.enum(["facile", "moyen", "difficile"]).default("facile"),
  prep_time: z.number().int().min(5).max(240),
  servings: z.number().int().min(1).max(20),
  appliance: z.string(),
  protein: z.string(),
  vegetables: z.array(z.string()),
  calories: z.number().int().min(50).max(2000),
  ingredients: z.array(z.object({ name: z.string().min(1), qty: z.string().min(1) })).min(3),
  steps: z.array(z.object({ text: z.string().min(4), timer_minutes: z.number().int().min(0).optional(), appliance_settings: z.string().optional() })).min(3),
  missing_ingredients: z.array(z.string()).default([]),
  feasibility: z.number().int().min(0).max(100).optional(),
});
type FridgeRecipe = z.infer<typeof fridgeRecipeBaseSchema>;
const fridgeRecipeSchema: z.ZodType<FridgeRecipe, z.ZodTypeDef, unknown> = z.preprocess(
  normalizeFridgeRecipe,
  fridgeRecipeBaseSchema,
);
const suggestionsSchema: z.ZodType<{ suggestions: FridgeRecipe[] }, z.ZodTypeDef, unknown> = z.object({
  suggestions: z.array(fridgeRecipeSchema).min(1).max(6),
});
const singleSuggestionSchema: z.ZodType<{ recipe: FridgeRecipe }, z.ZodTypeDef, unknown> = z.object({
  recipe: fridgeRecipeSchema,
});

export const suggestFromFridge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Cle Lovable AI manquante");

    const [fridge, prefs, appl, profile, existing] = await Promise.all([
      supabase.from("fridge_items").select("name, qty").eq("user_id", userId),
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
      supabase.from("appliances").select("appliance").eq("user_id", userId),
      supabase.from("profiles").select("household_size").eq("id", userId).maybeSingle(),
      supabase.from("recipes").select("title, protein, vegetables, ingredients").eq("owner_id", userId).limit(300),
    ]);
    const items = (fridge.data ?? []).map((f) => `${f.name}${f.qty ? ` (${f.qty})` : ""}`);
    if (!items.length) throw new Error("Ajoutez d'abord des ingredients dans votre frigo");
    const restrictions = (prefs.data ?? []).map((p) => p.restriction);
    const appliances = (appl.data ?? []).map((a) => a.appliance).join(", ") || "poele, four, casserole";
    const servings = profile.data?.household_size ?? 4;
    const existingTitles = (existing.data ?? []).map((r) => r.title);
    const existingNorm = new Set(existingTitles.map(normalizeTitle));
    const existingSigs = new Set((existing.data ?? []).map((r: any) => recipeSignature(r)).filter(Boolean));

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const cuisinePalette = [
      "française (bistrot, gratin, mijoté, sauce crème/vin/herbes)",
      "italienne (pâtes, risotto, sauce tomate/basilic/parmesan)",
      "asiatique (wok soja-gingembre-ail-sésame, légumes croquants)",
      "orientale/marocaine (tajine, cumin, ras el hanout, citron confit, olives)",
      "indienne (curry, garam masala, lait de coco, coriandre)",
      "tex-mex (cumin, paprika fumé, haricots, maïs, citron vert)",
      "méditerranéenne (huile d'olive, citron, herbes, féta, olives)",
      "libanaise (sumac, tahini, persil, citron, grenade)",
    ];

    function buildSystem(cuisine: string, variation: string) {
      return `Tu es un chef qui propose UNE recette COMPLETE, COHERENTE et SAVOUREUSE realisable avec le frigo de la famille.
Regles ABSOLUES :
- Identite culinaire CLAIRE : cuisine ${cuisine}. La recette doit sentir son pays : épices, sauce, technique, accompagnement cohérents avec ce style.
- Accords logiques proteine + legumes + sauce + accompagnement. Rien de bancal.
- Respecter ABSOLUMENT les exclusions : ${restrictions.join(", ") || "aucune"}.
- Eviter ces titres deja presents dans la bibliotheque : ${existingTitles.slice(0, 30).join(" | ") || "aucun"}.
- Appareils disponibles : ${appliances}. Pour CHAQUE etape, "appliance_settings" doit contenir le mode ET l'intensite precise (temperature °C, feu 1-9, duree).
- Portions : ${servings}.
- Quantites en grammes ("200 g") ou millilitres ("150 ml") quand possible.
- "missing_ingredients" = ce qu'il manque à acheter (le moins possible).
- "feasibility" (0-100) = pourcentage d'ingrédients déjà au frigo (sel/poivre/huile/eau = toujours dispo).
- 5 à 7 etapes avec timer_minutes et appliance_settings, ingredients avec qty, protein, vegetables, calories, prep_time.
${variation}
Reponds : {"recipe": { ... une recette complete ... }}.`;
    }

    // Pick 3 distinct cuisines (shuffled) and generate in parallel for speed
    const shuffled = [...cuisinePalette].sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, 3);

    async function genOne(cuisine: string, variation = "") {
      try {
        const { recipe } = await generateJson<{ recipe: FridgeRecipe }>({
          model,
          system: buildSystem(cuisine, variation),
          prompt: `Frigo : ${items.join(", ")}. Genere UNE recette ${cuisine} complete, savoureuse et coherente.`,
          schema: singleSuggestionSchema,
          maxOutputTokens: 2500,
        });
        return recipe;
      } catch (e) {
        console.error("Fridge recipe generation failed", { cuisine, error: (e as Error).message });
        return null;
      }
    }

    const results = await Promise.all(picks.map((c) => genOne(c)));
    let accumulated: FridgeRecipe[] = results.filter((r): r is FridgeRecipe => !!r)
      .filter((s) => violatesRestrictions(s, restrictions).length === 0);

    // Dedup against library when possible, but never drop everything
    const novel = accumulated.filter(
      (s) => !existingNorm.has(normalizeTitle(s.title)) && !existingSigs.has(recipeSignature(s)),
    );
    if (novel.length >= 1) accumulated = novel;

    // Retry the missing slots once if we have fewer than 3
    if (accumulated.length < 3) {
      const remaining = shuffled.slice(3, 3 + (3 - accumulated.length));
      const retry = await Promise.all(
        remaining.map((c) => genOne(c, "Propose une recette RADICALEMENT differente des classiques."))
      );
      for (const r of retry) {
        if (!r) continue;
        if (violatesRestrictions(r, restrictions).length > 0) continue;
        if (accumulated.some((k) => isSimilarRecipe(k, r))) continue;
        accumulated.push(r);
      }
    }

    if (accumulated.length === 0) {
      throw new Error("L'IA n'a pas réussi à générer une recette. Réessaie dans un instant.");
    }

    accumulated.sort((a, b) => (b.feasibility ?? 0) - (a.feasibility ?? 0));
    return accumulated;
  });

// ============== MEAL PLAN ==============

export const listMealPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { week_start: string }) =>
    z.object({ week_start: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const start = new Date(data.week_start);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const { data: rows, error } = await supabase
      .from("meal_plan")
      .select("id, date, slot, servings, recipe_id, recipes(id, title, cuisine_style, prep_time)")
      .eq("user_id", userId)
      .gte("date", data.week_start)
      .lt("date", end.toISOString().slice(0, 10));
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertMealPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        date: z.string(),
        slot: z.enum(["soir", "entree", "soupe", "dessert"]),
        recipe_id: z.string().uuid(),
        servings: z.number().int().min(1).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("meal_plan")
      .delete()
      .eq("user_id", userId)
      .eq("date", data.date)
      .eq("slot", data.slot);
    const { data: row, error } = await supabase
      .from("meal_plan")
      .insert({
        user_id: userId,
        date: data.date,
        slot: data.slot,
        recipe_id: data.recipe_id,
        servings: data.servings ?? 4,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeMealPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("meal_plan").delete().eq("id", data.id).eq("user_id", userId);
    return { ok: true };
  });

export const clearWeekPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ week_start: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const start = new Date(data.week_start);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const { error } = await supabase
      .from("meal_plan")
      .delete()
      .eq("user_id", userId)
      .gte("date", data.week_start)
      .lt("date", end.toISOString().slice(0, 10));
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============== SHOPPING LIST ==============

export const listShopping = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("shopping_list")
      .select("*")
      .eq("user_id", userId)
      .order("category");
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const validSet = new Set<string>(CATEGORIES);
    // Re-classify: if our rule-based classifier confidently knows the item,
    // trust it over whatever was stored (AI or legacy data).
    const toFix = rows.filter((r: any) => {
      if (!r.category || !validSet.has(r.category)) return true;
      const guess = classifyItem(r.item ?? "");
      return guess !== "Autres" && guess !== r.category;
    });
    if (toFix.length) {
      await Promise.all(
        toFix.map((r: any) => {
          const guess = classifyItem(r.item ?? "");
          const newCat = guess !== "Autres" ? guess : (validSet.has(r.category) ? r.category : "Autres");
          r.category = newCat;
          return supabase.from("shopping_list").update({ category: newCat }).eq("id", r.id);
        }),
      );
    }
    return rows;
  });

export const addShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        item: z.string().min(1).max(80),
        category: z.string().max(40).optional(),
        qty: z.string().max(40).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("shopping_list")
      .insert({
        user_id: userId,
        item: data.item,
        category: data.category ?? classifyItem(data.item),
        qty: data.qty ?? null,
        source: "manual",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const toggleShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), checked: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("shopping_list")
      .update({ checked: data.checked })
      .eq("id", data.id)
      .eq("user_id", userId);
    return { ok: true };
  });

export const removeShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("shopping_list").delete().eq("id", data.id).eq("user_id", userId);
    return { ok: true };
  });

export const clearCheckedShopping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("shopping_list").delete().eq("user_id", userId).eq("checked", true);
    return { ok: true };
  });

export const clearAllShopping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("shopping_list").delete().eq("user_id", userId);
    return { ok: true };
  });

function normalizeShoppingOutput(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const data = raw as Record<string, any>;
  if (Array.isArray(data.items)) return data;
  const source = data.courses ?? data.liste_courses ?? data.shopping_list ?? data.liste;
  if (!source || typeof source !== "object") return data;
  const items: any[] = [];
  for (const [category, rows] of Object.entries(source as Record<string, any>)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      items.push({
        item: String(row?.item ?? row?.name ?? row?.nom ?? row?.ingredient ?? "").trim(),
        qty: String(row?.qty ?? row?.quantity ?? row?.quantite ?? row?.quantité ?? "").trim(),
        category,
      });
    }
  }
  return { items };
}

const categoryMap: Record<string, string> = {
  fruits: "Fruits",
  legumes: "Legumes",
  "fruits et legumes": "Legumes",
  "fruits & legumes": "Legumes",
  primeur: "Legumes",
  boucherie: "Viandes",
  viandes: "Viandes",
  volaille: "Viandes",
  poissonnerie: "Poissons & fruits de mer",
  poissons: "Poissons & fruits de mer",
  "fruits de mer": "Poissons & fruits de mer",
  charcuterie: "Charcuterie",
  cremerie: "Cremerie & oeufs",
  "produits laitiers": "Cremerie & oeufs",
  oeufs: "Cremerie & oeufs",
  fromages: "Fromages",
  fromage: "Fromages",
  "pates et riz": "Pates, riz & feculents",
  feculents: "Pates, riz & feculents",
  conserves: "Conserves",
  epicerie: "Epicerie salee",
  "epicerie salee": "Epicerie salee",
  "epicerie sucree": "Epicerie sucree",
  sucre: "Epicerie sucree",
  patisserie: "Epicerie sucree",
  sauces: "Sauces & condiments",
  condiments: "Sauces & condiments",
  epices: "Herbes & epices",
  "herbes et epices": "Herbes & epices",
  huiles: "Huiles & vinaigres",
  "huiles et vinaigres": "Huiles & vinaigres",
  boulangerie: "Boulangerie",
  pain: "Boulangerie",
  surgeles: "Surgeles",
  boissons: "Boissons",
  aperitif: "Aperitif",
  hygiene: "Hygiene & entretien",
  entretien: "Hygiene & entretien",
};

const CATEGORIES = [
  "Fruits",
  "Legumes",
  "Viandes",
  "Poissons & fruits de mer",
  "Charcuterie",
  "Cremerie & oeufs",
  "Fromages",
  "Pates, riz & feculents",
  "Conserves",
  "Sauces & condiments",
  "Herbes & epices",
  "Huiles & vinaigres",
  "Epicerie salee",
  "Epicerie sucree",
  "Boulangerie",
  "Surgeles",
  "Boissons",
  "Aperitif",
  "Hygiene & entretien",
  "Autres",
] as const;

const itemRules: Array<[RegExp, (typeof CATEGORIES)[number]]> = [
  [/\b(pomme|poire|banane|orange|citron|clementine|mandarine|fraise|framboise|myrtille|cerise|raisin|peche|abricot|prune|ananas|mangue|kiwi|melon|pasteque|figue|grenade|avocat|datte|noix de coco)\b/, "Fruits"],
  [/\b(salade|laitue|roquette|epinard|mache|cresson|chou|brocoli|chou-fleur|carotte|navet|radis|betterave|panais|celeri|fenouil|poireau|oignon|echalote|ail|gingembre|patate|pomme de terre|courgette|aubergine|poivron|piment|tomate|concombre|courge|potiron|butternut|champignon|haricot vert|petit pois|mais|artichaut|asperge|endive|persil frais|coriandre fraiche|basilic frais|menthe fraiche|ciboulette)\b/, "Legumes"],
  [/\b(poulet|dinde|boeuf|veau|porc|agneau|canard|lapin|steak|escalope|cuisse|filet|hachis|viande hachee|saucisse(?! sec)|merguez|brochette)\b/, "Viandes"],
  [/\b(saumon|thon|cabillaud|colin|merlu|lieu|sardine|maquereau|truite|dorade|bar|lotte|crevette|gambas|moule|huitre|coquille|calamar|poulpe|seiche|surimi|poisson)\b/, "Poissons & fruits de mer"],
  [/\b(jambon|bacon|lardon|chorizo|saucisson|rillette|pate|terrine|saucisse seche|coppa)\b/, "Charcuterie"],
  [/\b(lait|creme|beurre|yaourt|fromage blanc|faisselle|skyr|petit suisse|oeuf|oeufs|margarine)\b/, "Cremerie & oeufs"],
  [/\b(gruyere|emmental|comte|parmesan|mozzarella|ricotta|feta|chevre|camembert|brie|roquefort|bleu|raclette|reblochon|tomme|cheddar|burrata|mascarpone)\b/, "Fromages"],
  [/\b(pates|spaghetti|penne|tagliatelle|fusilli|macaroni|coquillette|lasagne|riz|quinoa|boulgour|semoule|couscous|polenta|lentille|pois chiche|haricot sec|haricot rouge|haricot blanc)\b/, "Pates, riz & feculents"],
  [/\b(conserve|boite|pulpe de tomate|tomate pelee|concentre de tomate|mais en boite|thon en boite|sardine en boite|haricot en boite)\b/, "Conserves"],
  [/\b(ketchup|mayonnaise|moutarde|sauce soja|sauce|nuoc-mam|tabasco|sriracha|pesto|tapenade|cornichon|olive|cape?res|vinaigrette)\b/, "Sauces & condiments"],
  [/\b(sel|poivre|paprika|curry|curcuma|cumin|cannelle|muscade|origan|thym|laurier|romarin|herbes de provence|piment d'espelette|safran|gingembre moulu|ail en poudre|bouillon|cube)\b/, "Herbes & epices"],
  [/\b(huile|vinaigre)\b/, "Huiles & vinaigres"],
  [/\b(farine|levure|maizena|fecule|chapelure|biscotte|cereales|muesli|granola|flocons d'avoine|miel|confiture)\b/, "Epicerie salee"],
  [/\b(sucre|chocolat|cacao|vanille|biscuit|gateau|pate a tartiner|nutella|bonbon|caramel|sirop d'agave|sirop d'erable)\b/, "Epicerie sucree"],
  [/\b(pain|baguette|brioche|viennoiserie|croissant|wrap|tortilla|pain de mie|pita|naan)\b/, "Boulangerie"],
  [/\b(surgele|glace|sorbet|frites surgelees|legumes surgeles|pizza surgelee)\b/, "Surgeles"],
  [/\b(eau|jus|soda|coca|limonade|the|cafe|infusion|biere|vin|champagne|cidre)\b/, "Boissons"],
  [/\b(chips|cacahuete|amande|noix de cajou|pistache|olive(s)? aperitif|tarama|houmous|tzatziki)\b/, "Aperitif"],
  [/\b(savon|shampoing|dentifrice|lessive|liquide vaisselle|essuie-tout|sopalin|papier toilette|eponge)\b/, "Hygiene & entretien"],
];

export function classifyItem(name: string): (typeof CATEGORIES)[number] {
  const s = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const [re, cat] of itemRules) {
    if (re.test(s)) return cat;
  }
  return "Autres";
}

// ---- Consolidation de la liste de courses ----

function normalizeItemKey(name: string): string {
  let s = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Retire descripteurs courants qui ne changent pas le produit
  s = s.replace(/\b(frais|fraiches?|bio|surgele(s|es)?|en poudre|en morceaux|en tranches?|tranche(s)?|emincee?s?|hache(s|e|es)?|rape(s|e|es)?|moulu(e|s|es)?|sec(he|hes|s)?|nature|liquide|entier(e|s|es)?|demi-ecreme|ecreme|jaune|rouge|vert(e|s|es)?|blanc(he|hes|s)?|noir(e|s|es)?|doux|douce|fort(e|s|es)?|petit(e|s|es)?|gros(se|ses|s)?|grande?s?|moyen(ne|nes|s)?|extra|premium|de saison|du marche)\b/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // singularisation très simple
  s = s
    .split(" ")
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ");
  return s;
}

const UNIT_ALIASES: Record<string, string> = {
  g: "g", gr: "g", gramme: "g", grammes: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogramme: "kg", kilogrammes: "kg",
  mg: "mg",
  ml: "ml",
  cl: "cl",
  l: "l", litre: "l", litres: "l",
  cs: "c.s.", "c.s": "c.s.", "c.s.": "c.s.", cuillere: "c.s.", "cuilleres a soupe": "c.s.", "cuillere a soupe": "c.s.", cas: "c.s.",
  cc: "c.c.", "c.c": "c.c.", "c.c.": "c.c.", "cuillere a cafe": "c.c.", "cuilleres a cafe": "c.c.", cac: "c.c.",
  pincee: "pincée", pincees: "pincée", pincee_: "pincée",
  piece: "pièce", pieces: "pièce", unite: "pièce", unites: "pièce", u: "pièce",
  gousse: "gousse", gousses: "gousse",
  tranche: "tranche", tranches: "tranche",
  botte: "botte", bottes: "botte",
  sachet: "sachet", sachets: "sachet",
  paquet: "paquet", paquets: "paquet",
  boite: "boîte", boites: "boîte",
  bocal: "bocal", bocaux: "bocal",
  pot: "pot", pots: "pot",
  brique: "brique", briques: "brique",
};

function parseQtyTokens(qty: string): Array<{ value: number; unit: string }> {
  if (!qty) return [];
  const cleaned = qty
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/,/g, ".");
  const tokens: Array<{ value: number; unit: string }> = [];
  const re = /(\d+(?:\.\d+)?)\s*([a-z.]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const value = parseFloat(m[1]);
    if (!isFinite(value) || value <= 0) continue;
    let unit = (m[2] ?? "").replace(/\.+$/g, "").trim();
    if (!unit) unit = "pièce";
    unit = UNIT_ALIASES[unit] ?? unit;
    tokens.push({ value, unit });
  }
  return tokens;
}

// Conversions vers une unité canonique pour additionner
function canonical(u: string): { unit: string; factor: number } {
  switch (u) {
    case "kg": return { unit: "g", factor: 1000 };
    case "g": return { unit: "g", factor: 1 };
    case "mg": return { unit: "g", factor: 0.001 };
    case "l": return { unit: "ml", factor: 1000 };
    case "cl": return { unit: "ml", factor: 10 };
    case "ml": return { unit: "ml", factor: 1 };
    default: return { unit: u, factor: 1 };
  }
}

function formatQty(unit: string, total: number): string {
  if (unit === "g" && total >= 1000) {
    const kg = total / 1000;
    return `${Number.isInteger(kg) ? kg : kg.toFixed(2).replace(/\.?0+$/, "")} kg`;
  }
  if (unit === "ml" && total >= 1000) {
    const l = total / 1000;
    return `${Number.isInteger(l) ? l : l.toFixed(2).replace(/\.?0+$/, "")} L`;
  }
  const rounded = Math.round(total * 100) / 100;
  const out = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return unit === "pièce" ? `${out}` : `${out} ${unit}`;
}

function mergeQty(existing: string | null | undefined, incoming: string | null | undefined): string {
  const all = [...parseQtyTokens(existing ?? ""), ...parseQtyTokens(incoming ?? "")];
  if (!all.length) {
    return [existing, incoming].filter(Boolean).join(" + ") || "";
  }
  // Additionne par unité canonique
  const sums = new Map<string, number>();
  for (const t of all) {
    const c = canonical(t.unit);
    sums.set(c.unit, (sums.get(c.unit) ?? 0) + t.value * c.factor);
  }
  return Array.from(sums.entries()).map(([u, v]) => formatQty(u, v)).join(" + ");
}

function consolidateItems<T extends { item: string; qty?: string | null; category?: string | null }>(
  items: T[],
): Array<{ item: string; qty: string; category: string }> {
  const map = new Map<string, { item: string; qty: string; category: string }>();
  for (const it of items) {
    const cat = it.category && (CATEGORIES as readonly string[]).includes(it.category)
      ? it.category
      : classifyItem(it.item);
    const key = `${cat}::${normalizeItemKey(it.item)}`;
    const existing = map.get(key);
    if (existing) {
      existing.qty = mergeQty(existing.qty, it.qty ?? "");
    } else {
      map.set(key, {
        item: it.item.trim(),
        qty: (it.qty ?? "").trim(),
        category: cat,
      });
    }
  }
  return Array.from(map.values());
}

function normalizeCategory(value: unknown) {
  const raw = String(value ?? "").toLowerCase().trim();
  const compact = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (categoryMap[raw] || categoryMap[compact]) return categoryMap[raw] ?? categoryMap[compact];
  if (compact.includes("fruit")) return "Fruits";
  if (compact.includes("legume") || compact.includes("primeur")) return "Legumes";
  if (compact.includes("poisson") || compact.includes("mer")) return "Poissons & fruits de mer";
  if (compact.includes("viande") || compact.includes("boucher") || compact.includes("volaille")) return "Viandes";
  if (compact.includes("charcut")) return "Charcuterie";
  if (compact.includes("fromage")) return "Fromages";
  if (compact.includes("cremer") || compact.includes("lait") || compact.includes("oeuf")) return "Cremerie & oeufs";
  if (compact.includes("conserv")) return "Conserves";
  if (compact.includes("sauce") || compact.includes("condim")) return "Sauces & condiments";
  if (compact.includes("epice") || compact.includes("herbe")) return "Herbes & epices";
  if (compact.includes("huile") || compact.includes("vinaigre")) return "Huiles & vinaigres";
  if (compact.includes("pate") || compact.includes("riz") || compact.includes("feculent")) return "Pates, riz & feculents";
  if (compact.includes("sucr") || compact.includes("patiss") || compact.includes("dessert")) return "Epicerie sucree";
  if (compact.includes("epicer")) return "Epicerie salee";
  if (compact.includes("boulanger") || compact.includes("pain")) return "Boulangerie";
  if (compact.includes("surgele")) return "Surgeles";
  if (compact.includes("boisson")) return "Boissons";
  if (compact.includes("aperit")) return "Aperitif";
  if (compact.includes("hygien") || compact.includes("entretien")) return "Hygiene & entretien";
  return "Autres";
}

const shoppingGenBaseSchema = z.object({
  items: z
    .array(
      z.object({
        item: z.string().min(1),
        qty: z.string().default(""),
        category: z.preprocess(
          normalizeCategory,
          z.enum(CATEGORIES).default("Autres"),
        ),
      }),
    )
    .min(1),
});
const shoppingGenSchema: z.ZodType<z.infer<typeof shoppingGenBaseSchema>, z.ZodTypeDef, unknown> = z.preprocess(
  normalizeShoppingOutput,
  shoppingGenBaseSchema,
);

export const generateShoppingFromPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ week_start: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Cle Lovable AI manquante");

    const start = new Date(data.week_start);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const [plan, fridge] = await Promise.all([
      supabase
        .from("meal_plan")
        .select("servings, recipes(title, ingredients, servings)")
        .eq("user_id", userId)
        .gte("date", data.week_start)
        .lt("date", end.toISOString().slice(0, 10)),
      supabase.from("fridge_items").select("name, qty").eq("user_id", userId),
    ]);
    const recipes = (plan.data ?? [])
      .map((p: any) => {
        const r = p.recipes;
        if (!r) return null;
        return `- ${r.title} (${p.servings ?? r.servings ?? 4} pers): ${(r.ingredients ?? [])
          .map((i: any) => `${i.qty} ${i.name}`)
          .join(", ")}`;
      })
      .filter(Boolean)
      .join("\n");
    if (!recipes) throw new Error("Planifiez d'abord des recettes dans la semaine");
    const fridgeStr =
      (fridge.data ?? []).map((f) => `${f.name}${f.qty ? ` (${f.qty})` : ""}`).join(", ") || "vide";

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");
    const object = await generateJson({
      model,
      system: `Tu consolides une liste de courses a partir des recettes prevues. Additionne les quantites identiques, regroupe par rayon precis de supermarche, retire ce qui est deja dans le frigo.
Categories autorisees (choisis la plus precise) : Fruits | Legumes | Viandes | Poissons & fruits de mer | Charcuterie | Cremerie & oeufs | Fromages | Pates, riz & feculents | Conserves | Sauces & condiments | Herbes & epices | Huiles & vinaigres | Epicerie salee | Epicerie sucree | Boulangerie | Surgeles | Boissons | Aperitif | Hygiene & entretien | Autres.
Ne mets jamais des fruits et des legumes ensemble. Ne range pas dans "Epicerie salee" un produit qui a une categorie plus precise (ex: huile -> Huiles & vinaigres, ketchup -> Sauces & condiments, riz -> Pates, riz & feculents).
FORMAT STRICT : retourne uniquement {"items":[{"item":"...","qty":"...","category":"..."}]}. N'utilise jamais une clé "courses" ni des catégories comme objets racines.`,
      prompt: `Frigo dispo : ${fridgeStr}.\n\nRecettes prevues :\n${recipes}`,
      schema: shoppingGenSchema,
    });

    await supabase.from("shopping_list").delete().eq("user_id", userId).eq("source", "plan");
    // 1) Force la catégorie via classifieur déterministe
    const recategorized = object.items.map((i) => {
      const guess = classifyItem(i.item);
      return {
        item: i.item,
        qty: i.qty,
        category: guess !== "Autres" ? guess : i.category,
      };
    });
    // 2) Consolide les doublons en additionnant les quantités
    const consolidated = consolidateItems(recategorized);
    const rows = consolidated.map((i) => ({
      user_id: userId,
      item: i.item,
      qty: i.qty,
      category: i.category,
      source: "plan",
    }));
    if (rows.length) await supabase.from("shopping_list").insert(rows);
    return consolidated;
  });

// ============== BATCH COOKING ==============

function normalizeBatchOutput(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const data = raw as Record<string, any>;
  const stepsSource = data.parallel_steps ?? data.etapes_paralleles ?? data["étapes_parallèles"] ?? data.planning ?? data.deroule ?? [];
  const cookedSource = data.cooked_meals ?? data.repas_cuisines ?? data.repas_cuisinés ?? data.plats ?? [];
  const checklistSource = data.final_checklist ?? data.checklist_finale ?? data.checklist ?? [];
  return {
    title: String(data.title ?? data.titre ?? "Session batch cooking de la semaine"),
    total_time: Math.max(60, Math.round(Number(data.total_time ?? data.temps_total ?? data.duree_totale ?? data.durée_totale ?? 150)) || 150),
    cooked_meals: Array.isArray(cookedSource)
      ? cookedSource.map((m: any) => ({
          recipe_id: String(m?.recipe_id ?? m?.id ?? ""),
          title: String(m?.title ?? m?.titre ?? ""),
          appliance: String(m?.appliance ?? m?.appareil ?? "—"),
          program: m?.program ?? m?.programme ? String(m?.program ?? m?.programme) : undefined,
          temperature: m?.temperature ?? m?.température ? String(m?.temperature ?? m?.température) : undefined,
          duration_minutes: Math.max(1, Math.round(Number(m?.duration_minutes ?? m?.duree ?? m?.durée ?? 30)) || 30),
          start_at_minute: Math.max(0, Math.round(Number(m?.start_at_minute ?? m?.debut ?? m?.début ?? 0)) || 0),
          notes: m?.notes ?? m?.note ? String(m?.notes ?? m?.note) : undefined,
        }))
      : [],
    parallel_steps: Array.isArray(stepsSource)
      ? stepsSource.map((s: any, index: number) => ({
          time_block: String(s?.time_block ?? s?.creneau ?? s?.créneau ?? s?.bloc_temps ?? `${index * 30}-${index * 30 + 30} min`),
          duration_minutes: Math.max(5, Math.round(Number(s?.duration_minutes ?? s?.duree ?? s?.durée ?? 30)) || 30),
          tasks: Array.isArray(s?.tasks ?? s?.taches ?? s?.tâches)
            ? (s.tasks ?? s.taches ?? s.tâches).map(String)
            : [String(s?.task ?? s?.description ?? s?.texte ?? "Préparation batch")],
        }))
      : [],
    final_checklist: Array.isArray(checklistSource)
      ? checklistSource.map((c: any) => ({
          recipe_id: String(c?.recipe_id ?? c?.id ?? ""),
          label: String(c?.label ?? c?.text ?? c?.texte ?? "Plat prêt, portionné et au frigo"),
        }))
      : [],
  };
}

const batchBaseSchema = z.object({
  title: z.string(),
  total_time: z.number().int().min(60).max(240),
  cooked_meals: z.array(z.object({
    recipe_id: z.string().min(1),
    title: z.string().min(1),
    appliance: z.string().min(1),
    program: z.string().optional(),
    temperature: z.string().optional(),
    duration_minutes: z.number().int().min(1).max(360),
    start_at_minute: z.number().int().min(0).max(360),
    notes: z.string().optional(),
  })).min(1),
  parallel_steps: z.array(z.object({ time_block: z.string(), duration_minutes: z.number().int().min(5).max(120), tasks: z.array(z.string()).min(1) })).min(1),
  final_checklist: z.array(z.object({ recipe_id: z.string().min(1), label: z.string().min(1) })).min(1),
});
const batchSchema: z.ZodType<z.infer<typeof batchBaseSchema>, z.ZodTypeDef, unknown> = z.preprocess(
  normalizeBatchOutput,
  batchBaseSchema,
);

function isAiPaymentError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const anyError = error as any;
  return message.includes("Payment Required") || anyError?.status === 402 || anyError?.statusCode === 402 || anyError?.response?.status === 402;
}

function buildFallbackBatchSession(meals: any[], servings: number) {
  const FR_DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  const applianceLoads: Record<string, number> = {};
  const sortedMeals = [...meals]
    .filter((m: any) => m.recipes)
    .sort((a: any, b: any) => Number(b.recipes?.prep_time ?? 30) - Number(a.recipes?.prep_time ?? 30));

  const cooked_meals = sortedMeals.map((m: any) => {
    const recipe = m.recipes;
    const appliance = String(recipe.appliance ?? "appareil principal");
    const key = appliance.toLowerCase().trim() || "appareil principal";
    const duration = Math.max(15, Math.min(180, Math.round(Number(recipe.prep_time ?? 35)) || 35));
    const start = applianceLoads[key] ?? 0;
    applianceLoads[key] = start + duration;
    return {
      recipe_id: recipe.id,
      title: recipe.title,
      appliance,
      program: appliance.toLowerCase().includes("cookeo") ? "Cuisson sous pression / mijotage selon la recette" : "Cuisson complète selon la recette",
      temperature: appliance.toLowerCase().includes("four") ? "180°C" : "réglage adapté à l’appareil",
      duration_minutes: duration,
      start_at_minute: start,
      notes: `${servings} portions à cuire entièrement, portionner puis conserver au réfrigérateur.`,
    };
  });

  const total_time = Math.max(60, Math.min(240, Math.max(...Object.values(applianceLoads), 60)));
  const boundaries = Array.from(new Set([0, ...cooked_meals.flatMap((m) => [m.start_at_minute, m.start_at_minute + m.duration_minutes]), total_time]))
    .filter((n) => n >= 0 && n <= total_time)
    .sort((a, b) => a - b);

  const parallel_steps = boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const starting = cooked_meals.filter((m) => m.start_at_minute >= start && m.start_at_minute < end);
    const running = cooked_meals.filter((m) => m.start_at_minute < start && m.start_at_minute + m.duration_minutes > start);
    const tasks = [
      ...starting.map((m) => `Lancer ${m.title} sur ${m.appliance} : ${m.program}, durée ${m.duration_minutes} min.`),
      ...running.map((m) => `Surveiller ${m.title} sur ${m.appliance}, poursuivre la cuisson complète.`),
    ];
    return {
      time_block: `${start}-${end} min`,
      duration_minutes: Math.max(5, end - start),
      tasks: tasks.length ? tasks : ["Préparer les contenants, étiquettes et zones de refroidissement."],
    };
  });

  return {
    title: "Session batch cooking optimisée",
    total_time,
    cooked_meals: cooked_meals.sort((a, b) => a.start_at_minute - b.start_at_minute),
    parallel_steps: parallel_steps.length ? parallel_steps : [{ time_block: `0-${total_time} min`, duration_minutes: total_time, tasks: ["Cuire tous les plats, portionner puis ranger au frais."] }],
    final_checklist: meals.map((m: any) => {
      const d = new Date(m.date);
      const dayIdx = (d.getDay() + 6) % 7;
      return {
        recipe_id: m.recipes.id,
        label: `${m.recipes.title} (${FR_DAYS[dayIdx]}) : ${servings} portions cuites, refroidies, portionnées et rangées au frigo`,
      };
    }),
    ai_fallback: true,
  };
}

export const generateBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ week_start: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Cle Lovable AI manquante");

    // Load week plan + recipes
    const start = new Date(data.week_start);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const { data: plan } = await supabase
      .from("meal_plan")
      .select("id, date, slot, recipe_id, recipes(id, title, ingredients, protein, cuisine_style, appliance, prep_time, steps)")
      .eq("user_id", userId)
      .gte("date", data.week_start)
      .lt("date", end.toISOString().slice(0, 10))
      .order("date");
    const meals = (plan ?? []).filter((p: any) => p.recipes);
    if (meals.length < 3) throw new Error("Ajoute au moins 3 repas à ton planning de la semaine avant de générer la session batch.");

    const [prefs, appl, profile] = await Promise.all([
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
      supabase.from("appliances").select("appliance").eq("user_id", userId),
      supabase.from("profiles").select("household_size").eq("id", userId).maybeSingle(),
    ]);
    const restrictions = (prefs.data ?? []).map((p) => p.restriction);
    const appliances = (appl.data ?? []).map((a) => a.appliance).join(", ") || "poele, four, cookeo";
    const servings = profile.data?.household_size ?? 4;

    const FR_DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
    const mealsBrief = meals.map((m: any) => {
      const d = new Date(m.date);
      const dayIdx = (d.getDay() + 6) % 7;
      const ings = Array.isArray(m.recipes.ingredients)
        ? m.recipes.ingredients.slice(0, 8).map((i: any) => `${i.qty ?? ""} ${i.name ?? ""}`.trim()).join(", ")
        : "";
      const firstSteps = Array.isArray(m.recipes.steps)
        ? m.recipes.steps.slice(0, 3).map((s: any) => s?.text ?? "").filter(Boolean).join(" | ")
        : "";
      return `- id=${m.recipes.id} | ${FR_DAYS[dayIdx]} ${m.slot} | "${m.recipes.title}" | appareil: ${m.recipes.appliance ?? "non précisé"} | cuisson: ${m.recipes.prep_time ?? "?"} min | protéine: ${m.recipes.protein ?? "n/a"} | ingrédients: ${ings} | étapes-clés: ${firstSteps}`;
    }).join("\n");

    const object = await (async () => {
      try {
        const gateway = createLovableAiGatewayProvider(apiKey);
        const model = gateway("google/gemini-2.5-flash");
        return await generateJson({
          model,
          system: `Tu organises une session UNIQUE de batch cooking (samedi ou dimanche) pour ${servings} personnes. L'utilisateur cuisine INTÉGRALEMENT tous les plats de la semaine en une seule session, les portionne et les met au frigo. Chaque soir il n'aura qu'à RÉCHAUFFER.

Règles ABSOLUES :
- Chaque plat planifié doit être ENTIÈREMENT cuisiné pendant la session (pas de "base" à finir plus tard, pas de finition jour J).
- Chaque plat utilise l'APPAREIL associé à la recette (champ "appareil" ci-dessous). N'IGNORE JAMAIS l'appareil et ne le remplace pas. Si "non précisé", choisis parmi : ${appliances}.
- Précise pour chaque plat : appliance exact, program (ex : "Pression / Viande"), temperature (ex : "180°C"), duration_minutes, et start_at_minute (le moment où ce plat démarre, en minutes depuis le début de la session).
- ORDRE OPTIMAL : démarre en PREMIER les plats à cuisson LONGUE (mijotés, four lent, cocotte) pour qu'ils tournent pendant que tu prépares les plats plus rapides. Maximise le parallélisme entre appareils (chaque appareil peut tourner en parallèle des autres).
- "parallel_steps" = la timeline de la session découpée en blocs de temps (ex : "0-15 min", "15-45 min"…). Pour chaque bloc, liste les TÂCHES concrètes à mener en parallèle (ex : "Lancer le bœuf bourguignon au Cookeo : Mijotage 90 min", "Pendant ce temps, éplucher et tailler les légumes du curry").
- "final_checklist" : une ligne par plat planifié, pour cocher que le plat est cuit, portionné (${servings} parts) et rangé au frigo.
- "total_time" : durée TOTALE de la session (du début à la fin, parallélisme inclus), en minutes.
- Respecte les restrictions alimentaires : ${restrictions.join(", ") || "aucune"}.

FORMAT JSON STRICT : {"title":"...","total_time":150,"cooked_meals":[{"recipe_id":"<id exact>","title":"...","appliance":"cookeo","program":"Mijotage","temperature":"","duration_minutes":90,"start_at_minute":0,"notes":""}],"parallel_steps":[{"time_block":"0-15 min","duration_minutes":15,"tasks":["..."]}],"final_checklist":[{"recipe_id":"<id exact>","label":"Bœuf bourguignon : ${servings} portions au frigo"}]}. Le champ recipe_id DOIT être un id EXACT de la liste fournie. Chaque plat planifié DOIT apparaître dans cooked_meals ET dans final_checklist.`,
          prompt: `Repas planifiés cette semaine :\n${mealsBrief}\n\nGénère la session batch cooking pour ces repas précis.`,
          schema: batchSchema,
          maxOutputTokens: 7000,
        });
      } catch (error) {
        if (isAiPaymentError(error)) return buildFallbackBatchSession(meals, servings);
        throw error;
      }
    })();

    // Attach meta about meals for client display
    return {
      ...object,
      meals: meals.map((m: any) => {
        const d = new Date(m.date);
        const dayIdx = (d.getDay() + 6) % 7;
        return {
          recipe_id: m.recipes.id,
          title: m.recipes.title,
          day: FR_DAYS[dayIdx],
          date: m.date,
          slot: m.slot,
        };
      }),
    };
  });

// ============== WEEK PLAN AI ==============

const weekPlanSchema = z.object({
  picks: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        slot: z.enum(["soir"]),
        recipe_id: z.string(),
      }),
    )
    .min(1)
    .max(21),
});

export const generateWeekPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        week_start: z.string(),
        slots: z.array(z.enum(["soir"])).default(["soir"]),
        replace: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Cle Lovable AI manquante");

    const [recipesRes, prefs, profile, history] = await Promise.all([
      supabase
        .from("recipes")
        .select("id, title, protein, cuisine_style, prep_time, vegetables, calories")
        .eq("owner_id", userId)
        .limit(200),
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
      supabase.from("profiles").select("household_size").eq("id", userId).maybeSingle(),
      supabase
        .from("cooked_history")
        .select("recipe_id, taste_rating, family_loved, recipes(title)")
        .eq("user_id", userId)
        .order("cooked_at", { ascending: false })
        .limit(60),
    ]);
    const recipes = recipesRes.data ?? [];
    if (recipes.length < 3) throw new Error("Il te faut au moins 3 recettes en bibliothèque pour générer un planning.");

    const restrictions = (prefs.data ?? []).map((p) => p.restriction);
    const servings = profile.data?.household_size ?? 4;
    const tasteHint = buildTasteHint(history.data ?? []);
    const recentIds = new Set((history.data ?? []).slice(0, 8).map((h: any) => h.recipe_id));

    const start = new Date(data.week_start);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const { data: existing } = await supabase
      .from("meal_plan")
      .select("id, date, slot")
      .eq("user_id", userId)
      .gte("date", data.week_start)
      .lt("date", end.toISOString().slice(0, 10));
    const filledSet = new Set((existing ?? []).map((e: any) => `${e.date}|${e.slot}`));

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");

    const recipeList = recipes
      .map((r: any) =>
        `${r.id} | ${r.title} | protéine: ${r.protein ?? "?"} | style: ${r.cuisine_style ?? "?"} | ${r.prep_time ?? "?"} min | légumes: ${(r.vegetables ?? []).join(", ") || "—"}`,
      )
      .join("\n");

    const result = await generateJson<{ picks: { day: number; slot: "matin" | "midi" | "soir"; recipe_id: string }[] }>({
      model,
      system: `Tu remplis un planning hebdomadaire pour ${servings} personnes : UNIQUEMENT le dîner (slot "soir") pour chacun des 7 jours.
Règles ABSOLUES :
- Ne choisis QUE parmi les recipe_id listés ci-dessous (copie l'UUID exact).
- Respecte ABSOLUMENT ces restrictions : ${restrictions.join(", ") || "aucune"}.
- Équilibre des protéines sur les 7 dîners (règles strictes, basées sur le champ "protéine" de chaque recette) :
  • MAXIMUM 2 repas à base de poulet
  • MAXIMUM 2 repas à base de bœuf
  • AU MOINS 1 repas à base d'agneau
  • AU MOINS 1 repas à base de dinde OU de veau
  • AU MOINS 1 repas intégrant une légumineuse (lentilles, pois chiches, haricots, fèves…) comme accompagnement ou ingrédient principal (regarde aussi les légumes/ingrédients listés)
  • La MÊME protéine ne peut JAMAIS apparaître deux jours consécutifs
  • Aucune protéine n'est imposée à un jour fixe : répartis librement tant que les contraintes ci-dessus sont respectées
  Si la bibliothèque manque d'une protéine requise (ex: pas d'agneau), choisis la recette la plus proche et n'enfreins jamais les "MAXIMUM".
- Varie aussi les styles culinaires, et alterne dîners rapides (<25 min) en semaine et plats plus longs le week-end (samedi=jour 5, dimanche=jour 6).
- Évite les répétitions : une recette max 2 fois dans la semaine, jamais le même jour.
- Évite les recettes récemment cuisinées (ids: ${[...recentIds].join(", ") || "aucune"}).
- ${tasteHint || "Pas d'historique de goût encore."}
- Slot UNIQUE : "soir", pour chacun des 7 jours (jour 0 = lundi, jour 6 = dimanche). Total = 7 dîners.
Réponds en JSON strict : { "picks": [ { "day": 0-6, "slot": "soir", "recipe_id": "<uuid>" }, ... ] }`,
      prompt: `Recettes disponibles :\n${recipeList}\n\nGénère le planning complet.`,
      schema: weekPlanSchema,
      maxOutputTokens: 4000,
    });

    const validIds = new Set(recipes.map((r: any) => r.id));
    const inserts: { user_id: string; date: string; slot: string; recipe_id: string; servings: number }[] = [];
    const seen = new Set<string>();
    for (const p of result.picks) {
      if (!validIds.has(p.recipe_id)) continue;
      if (!(data.slots as readonly string[]).includes(p.slot)) continue;
      const d = new Date(start);
      d.setDate(d.getDate() + p.day);
      const dateStr = d.toISOString().slice(0, 10);
      const key = `${dateStr}|${p.slot}`;
      if (seen.has(key)) continue;
      if (!data.replace && filledSet.has(key)) continue;
      seen.add(key);
      inserts.push({ user_id: userId, date: dateStr, slot: p.slot, recipe_id: p.recipe_id, servings });
    }
    if (data.replace && inserts.length) {
      const dates = [...new Set(inserts.map((i) => i.date))];
      const slots = [...new Set(inserts.map((i) => i.slot))];
      await supabase
        .from("meal_plan")
        .delete()
        .eq("user_id", userId)
        .in("date", dates)
        .in("slot", slots);
    }
    if (inserts.length) {
      const { error } = await supabase.from("meal_plan").insert(inserts);
      if (error) throw new Error(error.message);
    }
    return { inserted: inserts.length, total_requested: 7 * data.slots.length };
  });

// Helper imported only inside generateWeekPlan — duplicate the lightweight
// taste hint here to keep this file independent from recipes.functions.
function buildTasteHint(history: any[]): string {
  if (!history.length) return "";
  const proteinScore = new Map<string, { sum: number; n: number }>();
  const loved: string[] = [];
  for (const h of history) {
    const r = h.recipes;
    if (!r) continue;
    if (h.family_loved && r.title) loved.push(r.title);
  }
  void proteinScore;
  return loved.length ? `Coups de cœur famille à privilégier dans la semaine : ${loved.slice(0, 5).join(", ")}.` : "";
}

// ============== SAVE BATCH SESSION ==============

const batchActionSchema = z.object({
  bases: z.array(z.object({ name: z.string(), qty: z.string().optional() })).default([]),
});

export const saveBatchSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => batchActionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.bases.length) return { shopping_inserted: 0 };
    const rows = data.bases.map((b) => ({
      user_id: userId,
      item: b.name,
      qty: b.qty ?? "",
      category: "Batch cooking",
      source: "batch",
    }));
    const { error } = await supabase.from("shopping_list").insert(rows);
    if (error) throw new Error(error.message);
    return { shopping_inserted: rows.length };
  });
