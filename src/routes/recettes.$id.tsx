import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRecipe, toggleFavorite } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Heart, Clock, Users, ChefHat, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/recettes/$id")({
  component: RecipeDetail,
});

function RecipeDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const get = useServerFn(getRecipe);
  const fav = useServerFn(toggleFavorite);
  const { data: r, isLoading } = useQuery({ queryKey: ["recipe", id], queryFn: () => get({ data: { id } }) });
  const favMut = useMutation({
    mutationFn: () => fav({ data: { recipe_id: id } }),
    onSuccess: (r) => toast.success(r.favorited ? "Ajouté aux favoris ❤️" : "Retiré des favoris"),
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-center py-12">Chargement...</p>;
  if (!r) return <p className="text-center py-12">Recette introuvable.</p>;

  const ingredients = (r.ingredients as any[]) ?? [];
  const steps = (r.steps as any[]) ?? [];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Link to="/recettes" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4"/>Bibliothèque</Link>

      <div className="aspect-[16/9] bg-gradient-to-br from-accent/40 to-secondary/40 rounded-3xl flex items-center justify-center">
        <ChefHat className="w-20 h-20 text-primary/40"/>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
          <span className="bg-secondary/50 px-2 py-1 rounded-full text-xs">{r.cuisine_style}</span>
          <span className="inline-flex items-center gap-1"><Clock className="w-4 h-4"/>{r.prep_time} min</span>
          <span className="inline-flex items-center gap-1"><Users className="w-4 h-4"/>{r.servings} pers.</span>
          <span className="capitalize">• {r.difficulty}</span>
          {r.appliance && <span>• {r.appliance}</span>}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">{r.title}</h1>
        {r.description && <p className="text-muted-foreground">{r.description}</p>}
      </div>

      <div className="flex gap-3">
        {user && (
          <Button variant="outline" onClick={() => favMut.mutate()} disabled={favMut.isPending}>
            <Heart className="w-4 h-4"/> Favori
          </Button>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-card border border-border rounded-2xl p-5">
          <h2 className="font-bold mb-3">Ingrédients</h2>
          <ul className="space-y-2 text-sm">
            {ingredients.map((ing, i) => (
              <li key={i} className="flex justify-between gap-2"><span>{ing.name}</span><span className="text-muted-foreground">{ing.qty}</span></li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-2 space-y-3">
          <h2 className="font-bold">Étapes</h2>
          {steps.map((s, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-4 flex gap-3">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center text-sm">{i + 1}</div>
              <div className="flex-1">
                <p>{s.text}</p>
                <div className="flex gap-2 mt-2 text-xs">
                  {s.timer_minutes ? <span className="bg-accent/40 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Clock className="w-3 h-3"/>{s.timer_minutes} min</span> : null}
                  {s.appliance_settings && <span className="bg-secondary/40 px-2 py-0.5 rounded-full">{s.appliance_settings}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}