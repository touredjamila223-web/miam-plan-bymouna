import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateRecipeForUser } from "@/lib/recipes.functions";
import { APPLIANCES } from "@/lib/constants";

type Body = { messages?: UIMessage[]; userId?: string | null };

function messageText(message: UIMessage | undefined) {
  return (message?.parts ?? [])
    .map((part: any) => (part?.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findApplianceId(text: string, allowedIds: string[]) {
  const explicitId = text.match(/id\s*:\s*([a-z0-9_-]+)/i)?.[1];
  if (explicitId && allowedIds.includes(explicitId)) return explicitId;
  const normalized = normalizeText(text);
  return APPLIANCES.find((appliance) => {
    if (!allowedIds.includes(appliance.id)) return false;
    const candidates = [appliance.id, appliance.label, appliance.label.replace(/\s+/g, "-")];
    return candidates.some((candidate) => {
      const c = normalizeText(candidate);
      return c.length >= 3 && normalized.includes(c);
    });
  })?.id;
}

function looksLikeRecipeRequest(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (/\b(recette|cuisine|cuisiner|prepare|preparer|plat|repas|diner|dejeuner|propose|idee)\b/.test(normalized)) {
    return true;
  }
  return /\b(soupe|poulet|boeuf|bœuf|veau|agneau|poisson|saumon|cabillaud|curry|tajine|gratin|pates|riz|lasagne|burger|salade|lentilles|legumes|omelette)\b/.test(
    normalized,
  );
}

function findPreviousDishPrompt(messages: UIMessage[], currentUserIndex: number, applianceIds: string[]) {
  for (let i = currentUserIndex - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    const text = messageText(message);
    const appliance = findApplianceId(text, applianceIds);
    const isApplianceChoice = appliance && normalizeText(text).split(" ").length <= 8;
    if (!isApplianceChoice && looksLikeRecipeRequest(text)) return text;
  }
  return "";
}

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

        const applianceIds: string[] = APPLIANCES.map((a) => a.id);
        // Toujours proposer TOUS les appareils dans le chat — l'utilisateur peut vouloir
        // tester une recette avec un appareil qu'il n'a pas encore enregistré.
        // On met d'abord ceux qu'il possède (priorité visuelle), puis les autres.
        const ownedSet = new Set(userAppliances.filter((id) => applianceIds.includes(id)));
        const orderedIds = [
          ...applianceIds.filter((id) => ownedSet.has(id)),
          ...applianceIds.filter((id) => !ownedSet.has(id)),
        ];
        const userApplianceOptions = orderedIds.map((id) => ({
          id,
          label: APPLIANCES.find((a) => a.id === id)?.label ?? id,
        }));

        const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
        const lastUserText = messageText(messages[lastUserIndex]);
        const selectedAppliance = findApplianceId(lastUserText, applianceIds);
        const previousDishPrompt = findPreviousDishPrompt(messages, lastUserIndex, applianceIds);
        const routeDishPrompt = previousDishPrompt || (looksLikeRecipeRequest(lastUserText) ? lastUserText : "");
        const shouldProposeNow = Boolean(userId && selectedAppliance && routeDishPrompt);
        const shouldAskApplianceNow = Boolean(userId && !selectedAppliance && looksLikeRecipeRequest(lastUserText));

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
                    const safePrompt = routeDishPrompt || prompt;
                    const safeAppliance = selectedAppliance || appliance;
                    const recipe = await generateRecipeForUser({ userId, prompt: safePrompt, appliance: safeAppliance });
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
          toolChoice: shouldProposeNow
            ? { type: "tool", toolName: "proposeRecipe" }
            : shouldAskApplianceNow
              ? { type: "tool", toolName: "askAppliance" }
              : "auto",
          stopWhen: stepCountIs(1),
          system: `Tu es Leia, l'assistante culinaire chaleureuse et précise de MiamPlan. Tu aides la famille à cuisiner sainement et à se faire plaisir.

Règles IMPÉRATIVES pour les recettes :
- Dès que l'utilisateur évoque vouloir une recette ou un plat, ne réponds JAMAIS la recette en texte. Utilise l'outil "proposeRecipe".
- Avant d'appeler proposeRecipe, vérifie quel appareil utiliser. Si l'appareil n'est PAS encore connu, appelle l'outil "askAppliance" (PAS du texte libre) pour proposer des boutons cliquables à l'utilisateur. N'invente jamais un appareil qu'il ne possède pas.
- Dès que l'utilisateur a confirmé un appareil (par bouton ou par texte ex : "Cookeo", "Monsieur Cuisine", "Airfryer"), APPELLE IMMÉDIATEMENT proposeRecipe en reprenant comme "prompt" le dernier plat évoqué dans la conversation et en mappant l'appareil sur l'un de ces identifiants : ${applianceIds.join(", ")}. Ne renvoie JAMAIS de texte vide.
- Si l'utilisateur dit "une autre", "propose autre chose", "varie", appelle à nouveau proposeRecipe avec une orientation différente (style culinaire, protéine ou technique différente) en gardant le même appareil sauf indication contraire.
- Après l'appel à proposeRecipe, contente-toi d'une phrase d'accroche courte ("Voilà ma proposition 🍽️ — tu peux la sauvegarder ou passer en mode cuisine.").
- Évite d'écrire des questions à choix en texte libre quand un outil "askAppliance" peut le faire à ta place.

État détecté côté serveur : ${shouldProposeNow ? `appelle proposeRecipe avec prompt="${routeDishPrompt}" et appliance="${selectedAppliance}".` : shouldAskApplianceNow ? "appelle askAppliance pour afficher les boutons d'appareils." : "pas d'action recette forcée."}

Pour les autres conversations (conseils, équivalents d'ingrédients, batch cooking, idées de semaine), réponds normalement en français, de manière concise et conviviale.${ctxBlock}`,
          messages: await convertToModelMessages(messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});
