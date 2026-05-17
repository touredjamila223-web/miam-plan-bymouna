import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCookedHistory } from "@/lib/cooking.functions";
import { useAuth } from "@/hooks/use-auth";
import { History, Star, Heart, ChefHat } from "lucide-react";

export const Route = createFileRoute("/historique")({
  head: () => ({ meta: [{ title: "Recettes réalisées — MiamPlan" }] }),
  component: HistoriquePage,
});

function HistoriquePage() {
  const { user } = useAuth();
  const list = useServerFn(listCookedHistory);
  const { data: rows } = useQuery({ queryKey: ["history"], queryFn: () => list(), enabled: !!user });

  if (!user) {
    return (
      <div className="text-center py-16">
        <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Connectez-vous pour suivre votre historique.</p>
        <Link to="/auth" className="bg-primary text-primary-foreground px-4 py-2 rounded-full">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><History className="w-7 h-7 text-primary" />Recettes réalisées</h1>
        <p className="text-muted-foreground">Vos repas cuisinés et leur note. L'IA s'en sert pour mieux vous proposer.</p>
      </header>

      <div className="space-y-3">
        {(rows ?? []).map((h: any) => (
          <div key={h.id} className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
            <ChefHat className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Link to="/recettes/$id" params={{ id: h.recipe_id }} className="font-semibold hover:underline">
                  {h.recipes?.title ?? "Recette"}
                </Link>
                <div className="text-xs text-muted-foreground">{new Date(h.cooked_at).toLocaleDateString("fr-FR")}</div>
              </div>
              <div className="text-xs text-muted-foreground mb-2">{h.recipes?.cuisine_style}</div>
              <div className="flex items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1">Goût {Array.from({ length: h.taste_rating }).map((_, i) => <Star key={i} className="w-3 h-3 fill-primary text-primary" />)}</span>
                <span className="inline-flex items-center gap-1">Facilité {Array.from({ length: h.ease_rating }).map((_, i) => <Star key={i} className="w-3 h-3 fill-primary text-primary" />)}</span>
                {h.family_loved && <Heart className="w-4 h-4 fill-primary text-primary" />}
              </div>
              {h.comment && <p className="text-sm text-muted-foreground mt-2 italic">« {h.comment} »</p>}
            </div>
          </div>
        ))}
        {!rows?.length && <p className="text-center text-muted-foreground py-12">Pas encore de plat cuisiné. Lancez un mode cuisine !</p>}
      </div>
    </div>
  );
}
