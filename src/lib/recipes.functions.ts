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

async function generateJson<T>(opts: {
  model: any;
  system: string;
  prompt: string;
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  maxOutputTokens?: number;
}): Promise<T> {
  const { text } = await generateText({
    model: opts.model,
    system: `${opts.system}\n\nRéponds uniquement avec du JSON valide, sans Markdown, sans commentaire, sans texte avant ou après.`,
    prompt: opts.prompt,
    temperature: 0.8,
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
  const r = raw as Record<string, any>;
  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients.map((ing: any) =>
        typeof ing === "string" ? { name: ing, qty: "" } : { name: String(ing?.name ?? ing?.ingredient ?? ""), qty: String(ing?.qty ?? ing?.quantity ?? "") },
      )
    : [];
  const stepsSource = Array.isArray(r.steps) ? r.steps : Array.isArray(r.instructions) ? r.instructions : [];
  const steps = stepsSource.map((step: any) =>
    typeof step === "string"
      ? { text: step, timer_minutes: 0 }
      : { text: String(step?.text ?? step?.instruction ?? ""), timer_minutes: Number(step?.timer_minutes ?? step?.timer ?? 0), appliance_settings: step?.appliance_settings ?? step?.settings },
  );
  return {
    title: String(r.title ?? "Recette familiale"),
    description: String(r.description ?? r.summary ?? r.title ?? "Une recette familiale cohérente et savoureuse."),
    cuisine_style: String(r.cuisine_style ?? r.cuisine ?? r.origin ?? "familial").toLowerCase(),
    difficulty: ["facile", "moyen", "difficile"].includes(r.difficulty) ? r.difficulty : "facile",
    prep_time: Number(r.prep_time ?? r.preparation_time ?? r.total_time ?? 35),
    servings: Number(r.servings ?? 4),
    appliance: String(r.appliance ?? r.device ?? "cookeo"),
    protein: String(r.protein ?? r.proteine ?? r.main_protein ?? "végétarien").toLowerCase(),
    vegetables: Array.isArray(r.vegetables) ? r.vegetables.map(String) : [],
    calories: Number(r.calories ?? r.kcal ?? 500),
    ingredients,
    steps,
  };
}

const recipeBaseSchema = z.object({
  title: z.string(),
  description: z.string(),
  cuisine_style: z.string(),
  difficulty: z.enum(["facile", "moyen", "difficile"]),
  prep_time: z.number().int().min(5).max(360),
  servings: z.number().int().min(1).max(20),
  appliance: z.string(),
  protein: z.string(),
  vegetables: z.array(z.string()),
  calories: z.number().int().min(50).max(2000),
  ingredients: z.array(z.object({ name: z.string(), qty: z.string() })).min(2),
  steps: z
    .array(
      z.object({
        text: z.string(),
        timer_minutes: z.number().int().min(0).optional(),
        appliance_settings: z.string().optional(),
      }),
    )
    .min(2),
});

type RecipeDto = z.infer<typeof recipeBaseSchema>;

const recipeSchema: z.ZodType<RecipeDto, z.ZodTypeDef, unknown> = z.preprocess(
  normalizeRecipe,
  recipeBaseSchema,
);

function buildSystemPrompt(ctx: {
  appliance: string;
  restrictions: string[];
  servings: number;
  family_name?: string | null;
}) {
  return `Tu es un chef cuisinier français créatif et précis qui assiste la famille ${
    ctx.family_name ?? ""
  }.
Règles ABSOLUES :
- La recette DOIT avoir une identité culinaire claire (français, italien, oriental, asiatique, méditerranéen, tex-mex, libanais, indien, japonais...). Tous les ingrédients, épices, sauces et accompagnements doivent appartenir à ce style. Aucune association incohérente.
- Les légumes doivent s'accorder naturellement avec la protéine et le style.
- La recette doit donner envie et être savoureuse, pas une simple liste d'ingrédients.
- Renseigne "protein" avec la protéine principale en un seul mot simple (poulet, boeuf, agneau, porc, poisson, fruits de mer, oeufs, tofu, légumineuses, fromage, végétarien).
- Renseigne "vegetables" avec la liste des légumes utilisés (3 à 6 entrées, nom simple en minuscules).
- Renseigne "calories" : estimation honnête des kcal par portion.
- Préférences alimentaires à respecter ABSOLUMENT (aucun ingrédient interdit) : ${
    ctx.restrictions.length ? ctx.restrictions.join(", ") : "aucune"
  }.
- Portions : ${ctx.servings} personnes.
- Appareil de cuisson : ${ctx.appliance}. Adapte chaque étape au fonctionnement RÉEL de cet appareil :
  * Cookeo : indique programme (Mijotage / Cuisson rapide / Dorer / Vapeur), pression, liquide minimum (250ml), durée.
  * Airfryer : température en °C, durée en minutes, secouer à mi-cuisson si nécessaire, ne pas surcharger.
  * Four traditionnel : préchauffage, température, chaleur tournante ou statique, position grille, durée.
  * Cocotte-minute : feu vif puis doux, durée après mise en pression.
  * Poêle : feu (vif/moyen/doux), matière grasse, durée par face.
  * Monsieur Cuisine : programme, vitesse, température, durée, sens des pales.
- Étapes claires, numérotées implicitement, avec timer en minutes quand il y a une cuisson minutée.
- Tout doit être en français.`;
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

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    return generateJson({
      model,
      system: buildSystemPrompt({ appliance: data.appliance, restrictions, servings, family_name }),
      prompt: `Génère une recette complète pour : ${data.prompt}`,
      schema: recipeSchema,
    });
  });

// Public — generate without account (guest mode)
export const generateRecipePublic = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    generateInput.extend({ restrictions: z.array(z.string()).max(20).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Clé Lovable AI manquante");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");
    return generateJson({
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
  });

const saveSchema = recipeBaseSchema.extend({
  photo_url: z.string().optional(),
  source: z.string().default("ai"),
});

const batchSchema = z.object({ recipes: z.array(recipeSchema).length(4) });

const batchInput = z.object({
  appliance: z.string().min(2).max(50),
  servings: z.number().int().min(1).max(20).optional(),
  restrictions: z.array(z.string()).max(20).optional(),
  exclude: z.array(z.string()).max(40).optional(),
  hint: z.string().max(300).optional(),
});

function buildBatchPrompt(exclude: string[], hint?: string) {
  return `Propose 4 recettes VARIÉES et savoureuses pour le repas familial.
Contraintes :
- Chaque recette doit avoir une identité culinaire claire et différente des autres autant que possible (varie les styles : ex. un français, un asiatique, un méditerranéen, un oriental).
- PROTÉINES : pas plus de 2 recettes avec la même protéine principale parmi les 4. Varie au maximum.
- Chaque recette doit être cohérente : protéine + légumes + sauce + épices + accompagnement forment un ensemble harmonieux.
- Évite ces titres déjà vus : ${exclude.length ? exclude.join(", ") : "aucun"}.
${hint ? `- Préférence utilisateur : ${hint}` : ""}
Réponds avec un objet { recipes: [4 recettes complètes] }.`;
}

async function generateBatchOnce(opts: {
  apiKey: string;
  appliance: string;
  restrictions: string[];
  servings: number;
  family_name: string | null;
  exclude: string[];
  hint?: string;
}) {
  const gateway = createLovableAiGatewayProvider(opts.apiKey);
  const model = gateway("google/gemini-3-flash-preview");
  const object = await generateJson({
    model,
    system: buildSystemPrompt({
      appliance: opts.appliance,
      restrictions: opts.restrictions,
      servings: opts.servings,
      family_name: opts.family_name,
    }),
    prompt: buildBatchPrompt(opts.exclude, opts.hint),
    schema: batchSchema,
    maxOutputTokens: 9000,
  });
  // Enforce max 2 same protein (post-check, deterministic trim)
  const counts: Record<string, number> = {};
  const kept: typeof object.recipes = [];
  for (const r of object.recipes) {
    const p = (r.protein ?? "").toLowerCase().trim();
    counts[p] = (counts[p] ?? 0) + 1;
    if (counts[p] <= 2) kept.push(r);
  }
  return kept;
}

export const generateRecipeBatch = createServerFn({ method: "POST" })
  .inputValidator((input) => batchInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Clé Lovable AI manquante");

    const restrictions = data.restrictions ?? [];
    const servings = data.servings ?? 4;
    const family_name: string | null = null;
    const exclude = data.exclude ?? [];
    let kept = await generateBatchOnce({
      apiKey,
      appliance: data.appliance,
      restrictions,
      servings,
      family_name,
      exclude,
      hint: data.hint,
    });
    // Top up if filter removed some
    let safety = 0;
    while (kept.length < 4 && safety < 2) {
      const more = await generateBatchOnce({
        apiKey,
        appliance: data.appliance,
        restrictions,
        servings,
        family_name,
        exclude: [...exclude, ...kept.map((r) => r.title)],
        hint: data.hint,
      });
      for (const r of more) {
        if (kept.length >= 4) break;
        kept.push(r);
      }
      safety += 1;
    }
    return kept.slice(0, 4);
  });

export const saveRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ recipes: z.array(saveSchema).min(1).max(10) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = data.recipes.map((r) => ({ ...r, owner_id: userId, source: "ai" }));
    const { data: inserted, error } = await supabase.from("recipes").insert(rows).select();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const saveRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("recipes")
      .insert({ ...data, owner_id: userId })
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
        "id, title, photo_url, cuisine_style, difficulty, prep_time, source, description, protein, vegetables, calories",
      )
      .eq("source", "seed")
      .order("created_at", { ascending: false })
      .limit(60);
    if (data?.search) query = query.ilike("title", `%${data.search}%`);
    if (data?.protein) query = query.eq("protein", data.protein);
    if (data?.cuisine) query = query.eq("cuisine_style", data.cuisine);
    if (data?.maxTime) query = query.lte("prep_time", data.maxTime);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listMyRecipes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { search?: string; protein?: string; cuisine?: string; maxTime?: number } | undefined) =>
      input ?? {},
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let query = supabase
      .from("recipes")
      .select(
        "id, title, photo_url, cuisine_style, difficulty, prep_time, source, description, protein, vegetables, calories",
      )
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(120);
    if (data?.search) query = query.ilike("title", `%${data.search}%`);
    if (data?.protein) query = query.eq("protein", data.protein);
    if (data?.cuisine) query = query.eq("cuisine_style", data.cuisine);
    if (data?.maxTime) query = query.lte("prep_time", data.maxTime);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
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