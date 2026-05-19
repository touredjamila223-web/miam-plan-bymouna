import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const recordCooked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        recipe_id: z.string().uuid(),
        taste_rating: z.number().int().min(1).max(5),
        ease_rating: z.number().int().min(1).max(5),
        family_loved: z.boolean().optional(),
        comment: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("cooked_history")
      .insert({
        user_id: userId,
        recipe_id: data.recipe_id,
        taste_rating: data.taste_rating,
        ease_rating: data.ease_rating,
        family_loved: data.family_loved ?? false,
        comment: data.comment ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listCookedHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("cooked_history")
      .select("id, cooked_at, taste_rating, ease_rating, family_loved, comment, recipe_id, recipes(id, title, cuisine_style)")
      .eq("user_id", userId)
      .order("cooked_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateCooked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        taste_rating: z.number().int().min(1).max(5),
        ease_rating: z.number().int().min(1).max(5),
        family_loved: z.boolean().optional(),
        comment: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("cooked_history")
      .update({
        taste_rating: data.taste_rating,
        ease_rating: data.ease_rating,
        family_loved: data.family_loved ?? false,
        comment: data.comment ?? null,
      })
      .eq("id", data.id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCooked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("cooked_history")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
