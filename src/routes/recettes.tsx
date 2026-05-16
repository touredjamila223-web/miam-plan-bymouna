import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listRecipes } from "@/lib/recipes.functions";
import { Input } from "@/components/ui/input";
import { ChefHat, Search } from "lucide-react";

export const Route = createFileRoute("/recettes")({
  head: () => ({ meta: [{ title: "Bibliothèque de recettes — MiamPlan" }] }),
  component: Recettes,
});

function Recettes() {
  const list = useServerFn(listRecipes);
  const [search, setSearch] = useState("");
  const { data } = useQuery({ queryKey: ["recipes", search], queryFn: () => list({ data: { search } }) });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Bibliothèque</h1>
        <p className="text-muted-foreground">Toutes nos recettes adaptées à vos appareils et préférences.</p>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
        <Input className="pl-9" placeholder="Rechercher une recette..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data ?? []).map((r) => (
          <Link key={r.id} to="/recettes/$id" params={{ id: r.id }} className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition">
            <div className="aspect-[4/3] bg-gradient-to-br from-accent/40 to-secondary/40 flex items-center justify-center">
              <ChefHat className="w-12 h-12 text-primary/40"/>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span className="bg-secondary/50 px-2 py-0.5 rounded-full">{r.cuisine_style}</span>
                <span>{r.prep_time} min</span>
                <span className="capitalize">{r.difficulty}</span>
              </div>
              <h2 className="font-semibold leading-tight">{r.title}</h2>
              {r.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
            </div>
          </Link>
        ))}
        {data && data.length === 0 && <p className="text-muted-foreground col-span-full text-center py-12">Aucune recette trouvée.</p>}
      </div>
    </div>
  );
}