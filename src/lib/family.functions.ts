import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getFamilyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profile, appliances, prefs, topRated, badRated] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("appliances").select("appliance").eq("user_id", userId),
      supabase.from("dietary_preferences").select("restriction").eq("user_id", userId),
      supabase
        .from("cooked_history")
        .select("recipe_id, taste_rating, recipes(title, cuisine_style)")
        .eq("user_id", userId)
        .gte("taste_rating", 4)
        .order("cooked_at", { ascending: false })
        .limit(10),
      supabase
        .from("cooked_history")
        .select("recipe_id, taste_rating, recipes(title)")
        .eq("user_id", userId)
        .lte("taste_rating", 2)
        .limit(10),
    ]);
    return {
      profile: profile.data,
      appliances: (appliances.data ?? []).map((a) => a.appliance),
      restrictions: (prefs.data ?? []).map((p) => p.restriction),
      topRated: topRated.data ?? [],
      badRated: badRated.data ?? [],
    };
  });

const onboardingSchema = z.object({
  family_name: z.string().min(1).max(100),
  household_size: z.number().int().min(1).max(20),
  appliances: z.array(z.string()).max(20),
  restrictions: z.array(z.string()).max(20),
});

export const saveOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => onboardingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("profiles")
      .upsert({
        id: userId,
        family_name: data.family_name,
        household_size: data.household_size,
        onboarded: true,
        updated_at: new Date().toISOString(),
      });
    await supabase.from("appliances").delete().eq("user_id", userId);
    await supabase.from("dietary_preferences").delete().eq("user_id", userId);
    if (data.appliances.length) {
      await supabase
        .from("appliances")
        .insert(data.appliances.map((appliance) => ({ user_id: userId, appliance })));
    }
    if (data.restrictions.length) {
      await supabase
        .from("dietary_preferences")
        .insert(data.restrictions.map((restriction) => ({ user_id: userId, restriction })));
    }
    return { ok: true };
  });