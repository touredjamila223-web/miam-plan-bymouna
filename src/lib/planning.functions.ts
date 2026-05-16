import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

async function generateJson<T>(opts: {
  model: any;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
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

const suggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string(),
        cuisine_style: z.string(),
        description: z.string(),
        missing_ingredients: z.array(z.string()),
        prep_time: z.number().int().min(5).max(180),
        appliance: z.string(),
      }),
    )
    .min(1)
    .max(5),
});

export const suggestFromFridge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Cle Lovable AI manquante");

    const [fridge, prefs, appl, profile] = await Promise.all([
      supabase.from("fridge_items").select("name, qty").eq("user_id", userId),
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
      supabase.from("appliances").select("appliance").eq("user_id", userId),
      supabase.from("profiles").select("household_size").eq("id", userId).maybeSingle(),
    ]);
    const items = (fridge.data ?? []).map((f) => `${f.name}${f.qty ? ` (${f.qty})` : ""}`);
    if (!items.length) throw new Error("Ajoutez d'abord des ingredients dans votre frigo");
    const restrictions = (prefs.data ?? []).map((p) => p.restriction);
    const appliances = (appl.data ?? []).map((a) => a.appliance).join(", ") || "poele, four, casserole";
    const servings = profile.data?.household_size ?? 4;

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");
    const object = await generateJson({
      model,
      system: `Tu es un chef qui propose 3 a 5 recettes COHERENTES realisables avec les ingredients du frigo de la famille.
Regles : identite culinaire claire (francais/italien/oriental/asiatique/mediterraneen/tex-mex/indien/libanais), accords logiques entre proteine, legumes, sauce et accompagnement.
Respecter ABSOLUMENT les exclusions : ${restrictions.join(", ") || "aucune"}.
Appareils disponibles : ${appliances}.
Portions : ${servings}.
Indique pour chaque suggestion les ingredients MANQUANTS a acheter (peu si possible).
Format attendu : {"suggestions":[{"title":"...","cuisine_style":"...","description":"...","missing_ingredients":["..."],"prep_time":30,"appliance":"..."}]}`,
      prompt: `Frigo : ${items.join(", ")}.`,
      schema: suggestionsSchema,
    });
    return object.suggestions;
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
