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
        const userApplianceOptions = (userAppliances.length ? userAppliances : applianceIds)
          .filter((id) => applianceIds.includes(id))
          .map((id) => ({ id, label: APPLIANCES.find((a) => a.id === id)?.label ?? id }));

        const tools = userId
          ? {
              askAppliance: tool({
                description:
                  "À utiliser UNIQUEMENT pour demander à l'utilisateur quel appareil de cuisson il veut utiliser, lorsque l'information manque avant d'appeler proposeRecipe. Affiche des boutons cliquables à l'utilisateur. N'appelle jamais cet outil si l'appareil est déjà connu.",
                inputSchema: z.object({
                  question: z
                    .string()
                    .min(2)
                    .max(200)
                    .describe("Question courte et chaleureuse posée à l'utilisateur, ex: 'Avec quel appareil veux-tu la cuisiner ?'"),
                }),
                execute: async ({ question }) => ({
                  question,
                  options: userApplianceOptions,
                }),
              }),
              proposeRecipe: tool({
                description:
                  "Génère une proposition de recette complète et structurée pour l'utilisateur, adaptée à un appareil de cuisson précis. À APPELER IMPÉRATIVEMENT dès que tu connais (1) le plat/idée demandé et (2) l'appareil choisi — y compris quand l'utilisateur vient juste de répondre avec un nom d'appareil après ta question. Ne renvoie JAMAIS la recette en texte : utilise UNIQUEMENT cet outil.",
                inputSchema: z.object({
                  prompt: z
                    .string()
                    .min(2)
                    .max(500)
                    .describe(
                      "Description du plat voulu, REPRISE du dernier message de demande de recette de l'utilisateur (ex: 'soupe de poulet africaine'). Ne JAMAIS mettre juste le nom de l'appareil ici.",
                    ),
                  appliance: z
                    .enum(applianceIds as [string, ...string[]])
                    .describe("Identifiant de l'appareil de cuisson confirmé par l'utilisateur."),
                }),
                execute: async ({ prompt, appliance }) => {
                  try {
                    const recipe = await generateRecipeForUser({ userId, prompt, appliance });
                    return recipe;
                  } catch (e: any) {
                    console.error("proposeRecipe failed", e);
                    return { error: e?.message ?? "Erreur génération recette" };
                  }
                },
              }),
            }
          : undefined;

        const gateway = createLovableAiGatewayProvider(apiKey);
        const result = streamText({
          model: gateway("google/gemini-2.5-flash"),
          tools,
          stopWhen: stepCountIs(50),
          system: `Tu es Leia, l'assistante culinaire chaleureuse et précise de MiamPlan. Tu aides la famille à cuisiner sainement et à se faire plaisir.

Règles IMPÉRATIVES pour les recettes :
- Dès que l'utilisateur évoque vouloir une recette ou un plat, ne réponds JAMAIS la recette en texte. Utilise l'outil "proposeRecipe".
- Avant d'appeler proposeRecipe, vérifie quel appareil utiliser. Si l'appareil n'est PAS encore connu, appelle l'outil "askAppliance" (PAS du texte libre) pour proposer des boutons cliquables à l'utilisateur. N'invente jamais un appareil qu'il ne possède pas.
- Dès que l'utilisateur a confirmé un appareil (par bouton ou par texte ex : "Cookeo", "Monsieur Cuisine", "Airfryer"), APPELLE IMMÉDIATEMENT proposeRecipe en reprenant comme "prompt" le dernier plat évoqué dans la conversation et en mappant l'appareil sur l'un de ces identifiants : ${applianceIds.join(", ")}. Ne renvoie JAMAIS de texte vide.
- Si l'utilisateur dit "une autre", "propose autre chose", "varie", appelle à nouveau proposeRecipe avec une orientation différente (style culinaire, protéine ou technique différente) en gardant le même appareil sauf indication contraire.
- Après l'appel à proposeRecipe, contente-toi d'une phrase d'accroche courte ("Voilà ma proposition 🍽️ — tu peux la sauvegarder ou passer en mode cuisine.").
- Évite d'écrire des questions à choix en texte libre quand un outil "askAppliance" peut le faire à ta place.

Pour les autres conversations (conseils, équivalents d'ingrédients, batch cooking, idées de semaine), réponds normalement en français, de manière concise et conviviale.${ctxBlock}`,
          messages: await convertToModelMessages(messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
