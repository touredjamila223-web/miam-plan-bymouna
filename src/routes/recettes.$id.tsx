import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRecipe, toggleFavorite } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Heart, Clock, Users, ArrowLeft, Play, Flame, Drumstick, Carrot, Minus, Plus, Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { scaleQty, caloriesPerServing, caloriesTotal } from "@/lib/scale";
import { generateRecipePdf } from "@/lib/recipe-pdf";

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
  const baseServings = Math.max(1, Number(r.servings ?? 4));
  return (
    <RecipeView
      recipe={r}
      ingredients={ingredients}
      steps={steps}
      baseServings={baseServings}
      onToggleFavorite={() => favMut.mutate()}
      favPending={favMut.isPending}
      showFav={!!user}
      id={id}
    />
  );
}

function RecipeView({
  recipe: r,
  ingredients,
  steps,
  baseServings,
  onToggleFavorite,
  favPending,
  showFav,
  id,
}: {
  recipe: any;
  ingredients: any[];
  steps: any[];
  baseServings: number;
  onToggleFavorite: () => void;
  favPending: boolean;
  showFav: boolean;
  id: string;
}) {
  const [servings, setServings] = useState(baseServings);
  const ratio = servings / baseServings;
  const kcalPortion = caloriesPerServing(r.calories);
  const kcalTotal = caloriesTotal(kcalPortion, servings);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Link to="/recettes" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4"/>Bibliothèque</Link>

      <div className="bg-card border border-border rounded-2xl p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
          <span className="bg-secondary/50 px-2 py-1 rounded-full text-xs">{r.cuisine_style}</span>
          {r.protein && <span className="bg-accent/40 px-2 py-1 rounded-full text-xs inline-flex items-center gap-1"><Drumstick className="w-3 h-3"/>{r.protein}</span>}
          <span className="inline-flex items-center gap-1"><Clock className="w-4 h-4"/>{r.prep_time} min</span>
          <span className="inline-flex items-center gap-1"><Users className="w-4 h-4"/>{servings} pers.</span>
          {kcalPortion != null && (
            <span className="inline-flex items-center gap-1"><Flame className="w-4 h-4"/>{kcalPortion} kcal/pers. · {kcalTotal} kcal total</span>
          )}
          <span className="capitalize">• {r.difficulty}</span>
          {r.appliance && <span>• {r.appliance}</span>}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-2">{r.title}</h1>
        {r.description && <p className="text-muted-foreground">{r.description}</p>}
        {r.vegetables && (r.vegetables as string[]).length > 0 && (
          <p className="text-sm text-muted-foreground mt-2 inline-flex items-center gap-1"><Carrot className="w-4 h-4"/>Légumes : {(r.vegetables as string[]).join(", ")}</p>
        )}
      </div>

      <div className="flex gap-3">
        <Link to="/recettes/cuisine/$id" params={{ id }} className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full font-medium inline-flex items-center gap-2 hover:opacity-90">
          <Play className="w-4 h-4"/> Mode cuisine
        </Link>
        <Button
          variant="outline"
          onClick={() => {
            try {
              generateRecipePdf({ ...r, ingredients, steps }, servings);
              toast.success("PDF téléchargé");
            } catch (e: any) {
              toast.error(e?.message ?? "Erreur PDF");
            }
          }}
        >
          <Download className="w-4 h-4"/> PDF
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const url = typeof window !== "undefined" ? window.location.href : "";
            const text = `${r.title} — ${r.prep_time ?? "?"} min · ${servings} pers.`;
            const nav = navigator as any;
            if (nav?.share) {
              try {
                await nav.share({ title: r.title, text, url });
              } catch {}
            } else if (nav?.clipboard?.writeText) {
              await nav.clipboard.writeText(url);
              toast.success("Lien copié");
            }
          }}
        >
          <Share2 className="w-4 h-4"/> Partager
        </Button>
        {showFav && (
          <Button variant="outline" onClick={onToggleFavorite} disabled={favPending}>
            <Heart className="w-4 h-4"/> Favori
          </Button>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="font-bold">Ingrédients</h2>
            <div className="flex items-center gap-1 bg-muted rounded-full p-1">
              <button
                type="button"
                onClick={() => setServings((s) => Math.max(1, s - 1))}
                className="w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent/30 disabled:opacity-40"
                disabled={servings <= 1}
                aria-label="Diminuer le nombre de personnes"
              >
                <Minus className="w-3.5 h-3.5"/>
              </button>
              <span className="text-sm font-semibold min-w-[3.5rem] text-center tabular-nums">
                {servings} pers.
              </span>
              <button
                type="button"
                onClick={() => setServings((s) => Math.min(20, s + 1))}
                className="w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent/30 disabled:opacity-40"
                disabled={servings >= 20}
                aria-label="Augmenter le nombre de personnes"
              >
                <Plus className="w-3.5 h-3.5"/>
              </button>
            </div>
          </div>
          {servings !== baseServings && (
            <p className="text-xs text-muted-foreground mb-2">
              Quantités ajustées (recette de base : {baseServings} pers.)
            </p>
          )}
          <ul className="space-y-2 text-sm">
            {ingredients.map((ing, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{ing.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {scaleQty(ing.qty, ratio)}
                </span>
              </li>
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