import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateRecipeForUser } from "@/lib/recipes.functions";
import { APPLIANCES } from "@/lib/constants";

type Body = { messages?: UIMessage[]; userId?: string | null };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const { messages, userId } = (await request.json()) as Body;
        if (!Array.isArray(messages)) return new Response("Messages requis", { status: 400 });
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("Clé manquante", { status: 500 });

        let ctxBlock = "";
        let userAppliances: string[] = [];
        if (userId) {
          const [profile, apps, prefs] = await Promise.all([
            supabaseAdmin.from("profiles").select("family_name, household_size").eq("id", userId).maybeSingle(),
            supabaseAdmin.from("appliances").select("appliance").eq("user_id", userId),
            supabaseAdmin.from("dietary_preferences").select("restriction").eq("user_id", userId),
          ]);
          userAppliances = (apps.data ?? []).map((a) => a.appliance);
          const appsLabels = userAppliances
            .map((id) => APPLIANCES.find((a) => a.id === id)?.label ?? id)
            .join(", ") || "non précisé";
          const prefs2 = (prefs.data ?? []).map((p) => p.restriction).join(", ") || "aucune";
          ctxBlock = `\nContexte famille : ${profile.data?.family_name ?? ""} (${profile.data?.household_size ?? 4} personnes).
Appareils disponibles : ${appsLabels}.
Restrictions alimentaires : ${prefs2}.`;
        }

        const applianceIds = APPLIANCES.map((a) => a.id);

        const tools = userId
          ? {
              proposeRecipe: tool({
                description:
                  "Génère une proposition de recette complète et structurée pour l'utilisateur, adaptée à un appareil de cuisson précis. Utilise cet outil dès que l'utilisateur demande une recette (et qu'on connaît l'appareil). Ne renvoie PAS la recette en texte toi-même : utilise UNIQUEMENT cet outil. Une fois l'outil appelé, fais juste une courte phrase d'accroche.",
                inputSchema: z.object({
                  prompt: z
                    .string()
                    .min(2)
                    .max(500)
                    .describe(
                      "Description de la recette voulue : ingrédients, style, contraintes, type de plat. Ex: 'poulet curry coco rapide pour ce soir'",
                    ),
                  appliance: z
                    .enum(applianceIds as [string, ...string[]])
                    .describe("Identifiant de l'appareil de cuisson confirmé par l'utilisateur."),
                }),
                execute: async ({ prompt, appliance }) => {
                  const recipe = await generateRecipeForUser({ userId, prompt, appliance });
                  return recipe;
                },
              }),
            }
          : undefined;

        const gateway = createLovableAiGatewayProvider(apiKey);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          tools,
          stopWhen: stepCountIs(50),
          system: `Tu es Leia, l'assistante culinaire chaleureuse et précise de MiamPlan. Tu aides la famille à cuisiner sainement et à se faire plaisir.

Règles IMPÉRATIVES pour les recettes :
- Dès que l'utilisateur évoque vouloir une recette ou un plat, ne réponds JAMAIS la recette en texte. Utilise l'outil "proposeRecipe".
- Avant d'appeler l'outil, vérifie quel appareil utiliser. Si l'utilisateur n'a pas précisé, demande-lui en une phrase quel appareil parmi ses appareils disponibles il veut utiliser (propose 2-3 options pertinentes). N'invente jamais un appareil qu'il ne possède pas.
- Si l'utilisateur dit "une autre", "propose autre chose", "varie", appelle à nouveau proposeRecipe avec une orientation différente (style culinaire, protéine ou technique différente).
- Après l'appel à l'outil, contente-toi d'une phrase d'accroche courte ("Voilà ma proposition ${"🍽️"} — tu peux la sauvegarder ou passer en mode cuisine.").

Pour les autres conversations (conseils, équivalents d'ingrédients, batch cooking, idées de semaine), réponds normalement en français, de manière concise et conviviale.${ctxBlock}`,
          messages: await convertToModelMessages(messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
