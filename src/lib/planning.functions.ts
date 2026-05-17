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
    system: `${opts.system}\n\nRéponds uniquement avec du JSON valide, sans Markdown, sans commentaire, sans texte avant ou après.`,
    prompt: opts.prompt,
    temperature: 0.6,
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
    const model = gateway("google/gemini-3-flash-preview");
    const object = await generateJson<{ suggestions: FridgeRecipe[] }>({
      model,
      system: `Tu es un chef qui propose 4 recettes COMPLETES, COHERENTES et VARIEES realisables avec le frigo de la famille.
Regles ABSOLUES :
- Identite culinaire claire et DIFFERENTE pour chaque recette (francais, italien, oriental, asiatique, mediterraneen, tex-mex, indien, libanais...).
- Accords logiques proteine + legumes + sauce + accompagnement.
- Pas plus de 2 recettes avec la meme proteine principale.
- Respecter ABSOLUMENT les exclusions : ${restrictions.join(", ") || "aucune"}.
- NE PROPOSE JAMAIS ces titres deja presents dans la bibliotheque de l'utilisateur : ${existingTitles.join(" | ") || "aucun"}. Invente des recettes differentes.
- Appareils disponibles : ${appliances}. Adapter chaque etape a l'appareil utilise (programme, temperature, duree).
- Portions : ${servings}.
- Indiquer les ingredients MANQUANTS a acheter (le moins possible) dans "missing_ingredients".
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

const shoppingGenSchema = z.object({
  items: z
    .array(
      z.object({
        item: z.string(),
        qty: z.string(),
        category: z.enum([
          "Fruits & legumes",
          "Viandes & poissons",
          "Cremerie",
          "Epicerie",
          "Boulangerie",
          "Surgeles",
          "Boissons",
          "Autres",
        ]),
      }),
    )
    .min(1),
});

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
    const model = gateway("google/gemini-3-flash-preview");
    const object = await generateJson({
      model,
      system: `Tu consolides une liste de courses a partir des recettes prevues. Additionne les quantites identiques, regroupe par categorie de rayon, retire ce qui est deja dans le frigo.`,
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

const batchSchema = z.object({
  title: z.string(),
  total_time: z.number().int(),
  bases: z.array(z.object({ name: z.string(), qty: z.string(), use_in: z.array(z.string()) })),
  parallel_steps: z.array(
    z.object({ time_block: z.string(), tasks: z.array(z.string()) }),
  ),
  meals: z.array(
    z.object({
      title: z.string(),
      day: z.string(),
      slot: z.enum(["midi", "soir"]),
      finish_steps: z.array(z.string()),
    }),
  ),
});

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
    const model = gateway("google/gemini-3-flash-preview");
    const object = await generateJson({
      model,
      system: `Tu concois une session de batch cooking dominicale de 2-3h pour preparer 5 repas de semaine pour ${servings} personnes.
Regles :
- Cuisiner des BASES (legumes rotis, cereales, proteines, sauces) REUTILISABLES dans plusieurs repas
- Optimiser : indiquer des etapes PARALLELES par bloc de temps en utilisant plusieurs appareils en meme temps : ${appliances}
- Chaque repas final doit avoir une identite culinaire (francais/italien/oriental/asiatique/mediterraneen) coherente et juste 5-10 min de finition en semaine
- Respecter ABSOLUMENT : ${restrictions.join(", ") || "aucune restriction"}`,
      prompt: `Genere une session batch cooking complete pour la semaine.`,
      schema: batchSchema,
      maxOutputTokens: 7000,
    });
    return object;
  });
