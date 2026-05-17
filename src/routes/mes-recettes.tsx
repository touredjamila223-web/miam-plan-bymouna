import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFavorites } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { RecipeCompactCard } from "@/components/recipe-compact-card";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/mes-recettes")({
  head: () => ({ meta: [{ title: "Mes recettes — MiamPlan" }] }),
  component: MesRecettes,
});

function MesRecettes() {
  const { user, loading } = useAuth();
  const fn = useServerFn(listFavorites);
  const { data } = useQuery({ queryKey: ["favorites"], queryFn: () => fn(), enabled: !!user });

  if (loading) return <p className="py-12 text-center text-muted-foreground">Chargement...</p>;
  if (!user) return (
    <div className="py-16 text-center max-w-md mx-auto">
      <Heart className="w-12 h-12 text-primary/40 mx-auto mb-3"/>
      <h1 className="text-2xl font-bold mb-2">Vos favoris vous attendent</h1>
      <p className="text-muted-foreground mb-4">Connectez-vous pour retrouver vos recettes préférées sur tous vos appareils.</p>
      <Link to="/auth" className="text-primary underline">Se connecter</Link>
    </div>
  );

  const recipes = (data ?? []) as any[];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Mes recettes ❤️</h1>
      {recipes.length === 0 && <p className="text-muted-foreground">Aucun favori pour l'instant. Ajoutez-en depuis la <Link to="/recettes" className="text-primary underline">bibliothèque</Link>.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {recipes.map((r) => (
          <RecipeCompactCard key={r.id} recipe={r} />
        ))}
      </div>
    </div>
  );
}