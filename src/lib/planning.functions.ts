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

function normalizeFridgeRecipe(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, any>;
  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients.map((ing: any) =>
        typeof ing === "string"
          ? { name: ing, qty: "" }
          : { name: String(ing?.name ?? ing?.ingredient ?? ""), qty: String(ing?.qty ?? ing?.quantity ?? "") },
      )
    : [];
  const stepsSource = Array.isArray(r.steps) ? r.steps : Array.isArray(r.instructions) ? r.instructions : [];
  const steps = stepsSource.map((step: any) =>
    typeof step === "string"
      ? { text: step, timer_minutes: 0 }
      : { text: String(step?.text ?? step?.instruction ?? step?.description ?? ""), timer_minutes: Number(step?.timer_minutes ?? step?.timer ?? step?.minutes ?? 0) || 0 },
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
    vegetables: splitList(r.vegetables ?? r.legumes),
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
  ingredients: z.array(z.object({ name: z.string(), qty: z.string() })).min(2),
  steps: z.array(z.object({ text: z.string(), timer_minutes: z.number().int().min(0).optional() })).min(2),
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
    const model = gateway("google/gemini-2.5-flash");
    const object = await generateJson<{ suggestions: FridgeRecipe[] }>({
      model,
      system: `Tu es un chef qui propose 4 recettes COMPLETES, COHERENTES et VARIEES realisables avec le frigo de la famille.
Regles ABSOLUES :
- Identite culinaire claire et DIFFERENTE pour chaque recette (francais, italien, oriental, asiatique, mediterraneen, tex-mex, indien, libanais...).
- Accords logiques proteine + legumes + sauce + accompagnement.
- Pas plus de 2 recettes avec la meme proteine principale.
- Respecter ABSOLUMENT les exclusions : ${restrictions.join(", ") || "aucune"}.
- NE PROPOSE JAMAIS ces titres deja presents dans la bibliotheque de l'utilisateur : ${existingTitles.join(" | ") || "aucun"}. Invente des recettes differentes.
- Appareils disponibles : ${appliances}. Pour CHAQUE etape, "appliance_settings" doit contenir le mode ET l'intensite precise (programme, temperature en °C, vitesse, position grille, chiffre du feu 1-9, duree). N'ecris jamais "feu moyen" sans chiffre, ni "cuire" sans temperature.
- Portions : ${servings}.
- Quantites : exprime TOUJOURS les "qty" en grammes (ex "200 g") ou millilitres (ex "150 ml"). Utilise "unites" ou "pincee" seulement quand impossible a peser.
- Indiquer les ingredients MANQUANTS a acheter (le moins possible) dans "missing_ingredients".
- Pour CHAQUE recette, calcule un score "feasibility" (0-100) reflétant le pourcentage d'ingrédients déjà présents dans le frigo (en excluant le sel/poivre/huile/eau qu'on considère toujours dispo). Une recette 100% faisable = aucun ingrédient à acheter, 60% = il manque environ 4 ingrédients sur 10, etc. Sois honnête, ne triche pas.
- prep_time = duree totale realiste (varier selon le type de recette).
- Renseigner ingredients (avec qty), steps (avec timer_minutes), protein, vegetables, calories.
Reponds : {"suggestions":[ 4 recettes completes ]}.`,
      prompt: `Frigo : ${items.join(", ")}. Genere 4 recettes completes.`,
      schema: suggestionsSchema,
      maxOutputTokens: 9000,
    });
    const filtered = object.suggestions.filter(
      (s) =>
        violatesRestrictions(s, restrictions).length === 0 &&
        !existingNorm.has(normalizeTitle(s.title)) &&
        !existingSigs.has(recipeSignature(s)),
    );
    // Dédoublonne aussi les variantes proches au sein du lot
    const unique: typeof filtered = [];
    for (const r of filtered) {
      if (unique.some((k) => isSimilarRecipe(k, r))) continue;
      unique.push(r);
    }
    // Tri par faisabilité décroissante : les recettes les plus réalisables avec le frigo en tête
    unique.sort((a, b) => (b.feasibility ?? 0) - (a.feasibility ?? 0));
    return unique;
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
        slot: z.enum(["matin", "midi", "soir"]),
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
    return data ?? [];
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
        category: data.category ?? "Autres",
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
  "fruits et légumes": "Fruits & legumes",
  "fruits et legumes": "Fruits & legumes",
  "fruits & légumes": "Fruits & legumes",
  "fruits & legumes": "Fruits & legumes",
  legumes: "Fruits & legumes",
  légumes: "Fruits & legumes",
  boucherie: "Viandes & poissons",
  poissonnerie: "Viandes & poissons",
  "viandes et poissons": "Viandes & poissons",
  "viandes & poissons": "Viandes & poissons",
  crémerie: "Cremerie",
  cremerie: "Cremerie",
  "produits laitiers": "Cremerie",
  frais: "Cremerie",
  epicerie: "Epicerie",
  épicerie: "Epicerie",
  boulangerie: "Boulangerie",
  surgeles: "Surgeles",
  surgelés: "Surgeles",
  boissons: "Boissons",
};

function normalizeCategory(value: unknown) {
  const raw = String(value ?? "").toLowerCase().trim();
  const compact = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (categoryMap[raw] || categoryMap[compact]) return categoryMap[raw] ?? categoryMap[compact];
  if (compact.includes("fruit") || compact.includes("legume") || compact.includes("primeur")) return "Fruits & legumes";
  if (compact.includes("viande") || compact.includes("poisson") || compact.includes("boucher")) return "Viandes & poissons";
  if (compact.includes("cremer") || compact.includes("lait") || compact.includes("fromage") || compact.includes("frais")) return "Cremerie";
  if (compact.includes("epicer")) return "Epicerie";
  if (compact.includes("boulanger") || compact.includes("pain")) return "Boulangerie";
  if (compact.includes("surgele")) return "Surgeles";
  if (compact.includes("boisson")) return "Boissons";
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
          z.enum(["Fruits & legumes", "Viandes & poissons", "Cremerie", "Epicerie", "Boulangerie", "Surgeles", "Boissons", "Autres"]).default("Autres"),
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
      system: `Tu consolides une liste de courses a partir des recettes prevues. Additionne les quantites identiques, regroupe par categorie de rayon, retire ce qui est deja dans le frigo.
FORMAT STRICT : retourne uniquement {"items":[{"item":"...","qty":"...","category":"Fruits & legumes|Viandes & poissons|Cremerie|Epicerie|Boulangerie|Surgeles|Boissons|Autres"}]}. N'utilise jamais une clé "courses" ni des catégories comme objets racines.`,
      prompt: `Frigo dispo : ${fridgeStr}.\n\nRecettes prevues :\n${recipes}`,
      schema: shoppingGenSchema,
    });

    await supabase.from("shopping_list").delete().eq("user_id", userId).eq("source", "plan");
    const rows = object.items.map((i) => ({
      user_id: userId,
      item: i.item,
      qty: i.qty,
      category: i.category,
      source: "plan",
    }));
    if (rows.length) await supabase.from("shopping_list").insert(rows);
    return object.items;
  });

// ============== BATCH COOKING ==============

function normalizeBatchOutput(raw: unknown) {
  if (!raw || typeof raw !== "object") return raw;
  const data = raw as Record<string, any>;
  const mealsSource = data.meals ?? data.repas_de_la_semaine ?? data.repas ?? [];
  const basesSource = data.bases ?? data.preparations_de_base ?? data.préparations_de_base ?? data.preparations ?? [];
  const stepsSource = data.parallel_steps ?? data.etapes_paralleles ?? data["étapes_parallèles"] ?? data.planning ?? data.deroule ?? [];
  return {
    title: String(data.title ?? data.titre ?? "Session batch cooking de la semaine"),
    total_time: Math.max(60, Math.round(Number(data.total_time ?? data.temps_total ?? data.duree_totale ?? data.durée_totale ?? 150)) || 150),
    bases: Array.isArray(basesSource)
      ? basesSource.map((b: any) => ({
          name: String(b?.name ?? b?.nom ?? b?.title ?? b?.titre ?? "Base préparée"),
          qty: String(b?.qty ?? b?.quantity ?? b?.quantite ?? b?.quantité ?? "à ajuster"),
          use_in: Array.isArray(b?.use_in ?? b?.utilise_dans ?? b?.utilisé_dans)
            ? (b.use_in ?? b.utilise_dans ?? b.utilisé_dans).map(String)
            : [],
        }))
      : [],
    parallel_steps: Array.isArray(stepsSource)
      ? stepsSource.map((s: any, index: number) => ({
          time_block: String(s?.time_block ?? s?.creneau ?? s?.créneau ?? s?.bloc_temps ?? `${index * 30}-${index * 30 + 30} min`),
          tasks: Array.isArray(s?.tasks ?? s?.taches ?? s?.tâches)
            ? (s.tasks ?? s.taches ?? s.tâches).map(String)
            : [String(s?.task ?? s?.description ?? s?.texte ?? "Préparation batch")],
        }))
      : [],
    meals: Array.isArray(mealsSource)
      ? mealsSource.map((m: any) => ({
          title: String(m?.title ?? m?.nom_repas ?? m?.name ?? m?.nom ?? "Repas préparé"),
          day: String(m?.day ?? m?.jour ?? "Semaine"),
          slot: String(m?.slot ?? m?.moment ?? "soir").toLowerCase().includes("midi") ? "midi" : "soir",
          finish_steps: Array.isArray(m?.finish_steps ?? m?.etapes_finition ?? m?.étapes_finition)
            ? (m.finish_steps ?? m.etapes_finition ?? m.étapes_finition).map(String)
            : [String(m?.finition_rapide ?? m?.finish ?? "Réchauffer et assembler les bases préparées.")],
        }))
      : [],
  };
}

const batchBaseSchema = z.object({
  title: z.string(),
  total_time: z.number().int().min(60).max(240),
  bases: z.array(z.object({ name: z.string().min(1), qty: z.string(), use_in: z.array(z.string()) })).min(1),
  parallel_steps: z.array(z.object({ time_block: z.string(), tasks: z.array(z.string()).min(1) })).min(1),
  meals: z.array(z.object({ title: z.string().min(1), day: z.string(), slot: z.enum(["midi", "soir"]), finish_steps: z.array(z.string()).min(1) })).min(3),
});
const batchSchema: z.ZodType<z.infer<typeof batchBaseSchema>, z.ZodTypeDef, unknown> = z.preprocess(
  normalizeBatchOutput,
  batchBaseSchema,
);

export const generateBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Cle Lovable AI manquante");
    const [prefs, appl, profile] = await Promise.all([
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
      supabase.from("appliances").select("appliance").eq("user_id", userId),
      supabase.from("profiles").select("household_size").eq("id", userId).maybeSingle(),
    ]);
    const restrictions = (prefs.data ?? []).map((p) => p.restriction);
    const appliances = (appl.data ?? []).map((a) => a.appliance).join(", ") || "poele, four, cookeo";
    const servings = profile.data?.household_size ?? 4;

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-2.5-flash");
    const object = await generateJson({
      model,
      system: `Tu concois une session de batch cooking dominicale de 2-3h pour preparer 5 repas de semaine pour ${servings} personnes.
Regles :
- Cuisiner des BASES (legumes rotis, cereales, proteines, sauces) REUTILISABLES dans plusieurs repas
- Optimiser : indiquer des etapes PARALLELES par bloc de temps en utilisant plusieurs appareils en meme temps : ${appliances}
- Chaque repas final doit avoir une identite culinaire (francais/italien/oriental/asiatique/mediterraneen) coherente et juste 5-10 min de finition en semaine
- Respecter ABSOLUMENT : ${restrictions.join(", ") || "aucune restriction"}
FORMAT STRICT : retourne uniquement {"title":"...","total_time":150,"bases":[{"name":"...","qty":"...","use_in":["..."]}],"parallel_steps":[{"time_block":"0-30 min","tasks":["..."]}],"meals":[{"title":"...","day":"Lundi","slot":"soir","finish_steps":["..."]}]}. N'utilise jamais les clés françaises "titre", "repas_de_la_semaine", "etapes_paralleles".`,
      prompt: `Genere une session batch cooking complete pour la semaine.`,
      schema: batchSchema,
      maxOutputTokens: 7000,
    });
    return object;
  });

// ============== WEEK PLAN AI ==============

const weekPlanSchema = z.object({
  picks: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        slot: z.enum(["matin", "midi", "soir"]),
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
        slots: z.array(z.enum(["matin", "midi", "soir"])).default(["midi", "soir"]),
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
      system: `Tu remplis un planning hebdomadaire de repas pour ${servings} personnes.
Règles ABSOLUES :
- Ne choisis QUE parmi les recipe_id listés ci-dessous (copie l'UUID exact).
- Respecte ABSOLUMENT ces restrictions : ${restrictions.join(", ") || "aucune"}.
- Équilibre la semaine : varie les protéines (jamais 2 fois la même protéine 2 jours de suite), varie les styles culinaires, alterne plats rapides (<25 min) en semaine et plats plus longs le week-end (samedi=jour 5, dimanche=jour 6).
- Évite les répétitions : une recette max 2 fois dans la semaine, jamais le même jour.
- Évite les recettes récemment cuisinées (ids: ${[...recentIds].join(", ") || "aucune"}).
- ${tasteHint || "Pas d'historique de goût encore."}
- Slots à remplir : ${data.slots.join(", ")} pour les 7 jours (jour 0 = lundi, jour 6 = dimanche). Total = 7 × ${data.slots.length} créneaux.
Réponds en JSON strict : { "picks": [ { "day": 0-6, "slot": "midi"|"soir"|"matin", "recipe_id": "<uuid>" }, ... ] }`,
      prompt: `Recettes disponibles :\n${recipeList}\n\nGénère le planning complet.`,
      schema: weekPlanSchema,
      maxOutputTokens: 4000,
    });

    const validIds = new Set(recipes.map((r: any) => r.id));
    const inserts: { user_id: string; date: string; slot: string; recipe_id: string; servings: number }[] = [];
    const seen = new Set<string>();
    for (const p of result.picks) {
      if (!validIds.has(p.recipe_id)) continue;
      if (!data.slots.includes(p.slot)) continue;
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
