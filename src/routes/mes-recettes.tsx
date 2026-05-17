import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listFavorites, toggleFavorite } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { RecipeCompactCard } from "@/components/recipe-compact-card";
import { RecipeCardSkeletonGrid } from "@/components/recipe-card-skeleton";
import { Heart, HeartOff } from "lucide-react";

export const Route = createFileRoute("/mes-recettes")({
  head: () => ({ meta: [{ title: "Mes recettes — MiamPlan" }] }),
  component: MesRecettes,
});

function MesRecettes() {
  const { user, loading } = useAuth();
  const fn = useServerFn(listFavorites);
  const toggleFn = useServerFn(toggleFavorite);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["favorites"], queryFn: () => fn(), enabled: !!user });
  const unfavMut = useMutation({
    mutationFn: (id: string) => toggleFn({ data: { recipe_id: id } }),
    onSuccess: () => {
      toast.success("Retiré des favoris");
      qc.invalidateQueries({ queryKey: ["favorites"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erreur"),
  });

  if (loading) return <div className="space-y-6"><div className="h-9 w-48 bg-primary/10 rounded animate-pulse" /><RecipeCardSkeletonGrid count={6} /></div>;
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
      {isLoading ? (
        <RecipeCardSkeletonGrid count={6} />
      ) : recipes.length === 0 ? (
        <p className="text-muted-foreground">Aucun favori pour l'instant. Ajoutez-en depuis la <Link to="/recettes" className="text-primary underline">bibliothèque</Link>.</p>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {recipes.map((r) => (
          <RecipeCompactCard
            key={r.id}
            recipe={r}
            action={
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  unfavMut.mutate(r.id);
                }}
                className="p-1.5 rounded-full bg-background/80 backdrop-blur border border-border text-primary hover:bg-destructive/10 hover:text-destructive hover:border-destructive transition"
                aria-label="Retirer des favoris"
                title="Retirer des favoris"
              >
                <HeartOff className="w-3.5 h-3.5" />
              </button>
            }
          />
        ))}
      </div>
      )}
    </div>
  );
}