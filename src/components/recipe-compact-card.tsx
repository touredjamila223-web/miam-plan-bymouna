import { Link } from "@tanstack/react-router";
import { Clock, Flame, Carrot } from "lucide-react";
import type { ReactNode } from "react";

type RecipeCardData = {
  id: string;
  title: string;
  cuisine_style?: string | null;
  protein?: string | null;
  prep_time?: number | null;
  calories?: number | null;
  vegetables?: string[] | null;
  description?: string | null;
};

function proteinEmoji(protein?: string | null) {
  if (!protein) return "🍽️";
  const value = protein.toLowerCase();
  if (value.includes("boeuf") || value.includes("bœuf") || value.includes("agneau") || value.includes("veau")) return "🥩";
  if (value.includes("porc") || value.includes("jambon") || value.includes("lard")) return "🥓";
  if (value.includes("poulet") || value.includes("dinde") || value.includes("volaille") || value.includes("canard")) return "🍗";
  if (value.includes("poisson") || value.includes("saumon") || value.includes("thon") || value.includes("cabillaud") || value.includes("crevette")) return "🐟";
  if (value.includes("oeuf") || value.includes("œuf")) return "🥚";
  if (value.includes("fromage")) return "🧀";
  if (value.includes("tofu") || value.includes("légumineuse") || value.includes("legumineuse") || value.includes("végé")) return "🥦";
  return "🍽️";
}

export function RecipeCompactCard({
  recipe,
  showDescription = false,
  action,
}: {
  recipe: RecipeCardData;
  showDescription?: boolean;
  action?: ReactNode;
}) {
  const vegetables = recipe.vegetables?.filter(Boolean) ?? [];

  return (
    <div className="relative bg-card border border-border rounded-xl hover:border-primary/40 hover:shadow-sm transition">
      {action && (
        <div className="absolute top-1.5 right-1.5 z-10">{action}</div>
      )}
      <Link
        to="/recettes/$id"
        params={{ id: recipe.id }}
        className="block p-3 pr-8 flex flex-col gap-1.5 min-h-[118px]"
      >
      <h2 className="font-semibold leading-tight text-sm flex items-start gap-1.5">
        <span className="text-base leading-none mt-0.5" aria-hidden>{proteinEmoji(recipe.protein)}</span>
        <span className="flex-1 line-clamp-2">{recipe.title}</span>
      </h2>
      <div className="flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground">
        <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">Familial</span>
        {recipe.protein && <span className="bg-accent/50 px-1.5 py-0.5 rounded-full capitalize">{recipe.protein}</span>}
        {recipe.cuisine_style && <span className="bg-secondary/60 px-1.5 py-0.5 rounded-full capitalize">{recipe.cuisine_style}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
        {recipe.prep_time != null && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{recipe.prep_time} min</span>}
        {recipe.calories != null && <span className="inline-flex items-center gap-1"><Flame className="w-3 h-3" />{recipe.calories} kcal</span>}
      </div>
      {vegetables.length > 0 && (
        <p className="text-[11px] text-muted-foreground inline-flex items-start gap-1 line-clamp-1">
          <Carrot className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="line-clamp-1">{vegetables.slice(0, 5).join(", ")}</span>
        </p>
      )}
      {showDescription && recipe.description && <p className="text-xs text-muted-foreground line-clamp-2">{recipe.description}</p>}
      </Link>
    </div>
  );
}