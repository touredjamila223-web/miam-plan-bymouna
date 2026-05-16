import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listMyRecipes } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROTEINS, CUISINE_STYLES } from "@/lib/constants";
import { ChefHat, Search, Clock, Drumstick, Flame, Carrot, X, Sparkles } from "lucide-react";

export const Route = createFileRoute("/recettes")({
  head: () => ({ meta: [{ title: "Bibliothèque de recettes — MiamPlan" }] }),
  component: Recettes,
});

const TIME_OPTIONS = [
  { v: "0", label: "Tous" },
  { v: "15", label: "≤ 15 min" },
  { v: "30", label: "≤ 30 min" },
  { v: "45", label: "≤ 45 min" },
  { v: "60", label: "≤ 1 h" },
];

function Recettes() {
  const listMine = useServerFn(listMyRecipes);
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [protein, setProtein] = useState<string>("");
  const [cuisine, setCuisine] = useState<string>("");
  const [maxTime, setMaxTime] = useState<string>("0");

  const params = {
    search: search || undefined,
    protein: protein || undefined,
    cuisine: cuisine || undefined,
    maxTime: maxTime && maxTime !== "0" ? Number(maxTime) : undefined,
  };
  const { data } = useQuery({
    queryKey: ["recipes", search, protein, cuisine, maxTime, !!user],
    enabled: !!user,
    queryFn: () => listMine({ data: params }),
  });

  const hasFilters = protein || cuisine || (maxTime && maxTime !== "0");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Bibliothèque</h1>
        <p className="text-muted-foreground">Toutes nos recettes adaptées à vos appareils et préférences.</p>
      </div>

      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <Input className="pl-9" placeholder="Rechercher une recette..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={protein} onValueChange={(v) => setProtein(v === "__all" ? "" : v)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Protéine"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Toutes les protéines</SelectItem>
              {PROTEINS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cuisine} onValueChange={(v) => setCuisine(v === "__all" ? "" : v)}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Origine culinaire"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Toutes les origines</SelectItem>
              {CUISINE_STYLES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={maxTime} onValueChange={setMaxTime}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Temps"/></SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setProtein(""); setCuisine(""); setMaxTime("0"); }}>
              <X className="w-4 h-4"/>Réinitialiser
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data ?? []).map((r: any) => (
          <Link key={r.id} to="/recettes/$id" params={{ id: r.id }} className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition">
            <div className="aspect-[4/3] bg-gradient-to-br from-accent/40 to-secondary/40 flex items-center justify-center">
              <ChefHat className="w-12 h-12 text-primary/40"/>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                {r.cuisine_style && <span className="bg-secondary/60 px-2 py-0.5 rounded-full">{r.cuisine_style}</span>}
                {r.protein && <span className="bg-accent/40 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Drumstick className="w-3 h-3"/>{r.protein}</span>}
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3"/>{r.prep_time} min</span>
                {r.calories != null && <span className="inline-flex items-center gap-1"><Flame className="w-3 h-3"/>{r.calories} kcal</span>}
              </div>
              <h2 className="font-semibold leading-tight">{r.title}</h2>
              {r.vegetables && r.vegetables.length > 0 && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Carrot className="w-3 h-3"/>{r.vegetables.slice(0, 4).join(", ")}</p>
              )}
              {r.description && <p className="text-sm text-muted-foreground line-clamp-2">{r.description}</p>}
            </div>
          </Link>
        ))}
        {!user && (
          <div className="col-span-full text-center py-12 space-y-3">
            <p className="text-muted-foreground">Connecte-toi pour démarrer ta bibliothèque familiale.</p>
            <Link to="/auth" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium">Se connecter</Link>
          </div>
        )}
        {user && data && data.length === 0 && (
          <div className="col-span-full text-center py-12 space-y-3">
            <p className="text-muted-foreground">Ta bibliothèque est encore vide. Génère tes premières recettes et sauvegarde celles qui te plaisent.</p>
            <Link to="/generer" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium"><Sparkles className="w-4 h-4"/>Générer des recettes</Link>
          </div>
        )}
      </div>
    </div>
  );
}