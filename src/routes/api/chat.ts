import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
        if (userId) {
          const [profile, apps, prefs] = await Promise.all([
            supabaseAdmin.from("profiles").select("family_name, household_size").eq("id", userId).maybeSingle(),
            supabaseAdmin.from("appliances").select("appliance").eq("user_id", userId),
            supabaseAdmin.from("dietary_preferences").select("restriction").eq("user_id", userId),
          ]);
          const apps2 = (apps.data ?? []).map((a) => a.appliance).join(", ") || "non précisé";
          const prefs2 = (prefs.data ?? []).map((p) => p.restriction).join(", ") || "aucune";
          ctxBlock = `\nContexte famille : ${profile.data?.family_name ?? ""} (${profile.data?.household_size ?? 4} personnes).
Appareils disponibles : ${apps2}.
Restrictions alimentaires : ${prefs2}.`;
        }

        const gateway = createLovableAiGatewayProvider(apiKey);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: `Tu es MiamPlan, un assistant culinaire chaleureux et expert. Tu aides la famille à cuisiner sainement, à gagner du temps avec le batch cooking, et à se faire plaisir. Tu donnes des conseils précis, des recettes cohérentes (jamais d'associations bancales), et tu adaptes selon les appareils et préférences de la famille. Réponds toujours en français de manière concise et conviviale.${ctxBlock}`,
          messages: await convertToModelMessages(messages),
        });
        return result.toUIMessageStreamResponse();
      },
    },
  },
});