import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listMyRecipes } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROTEINS, CUISINE_STYLES } from "@/lib/constants";
import { Search, Clock, Flame, Carrot, X, Sparkles } from "lucide-react";

function proteinEmoji(p?: string | null) {
  if (!p) return "🍽️";
  const v = p.toLowerCase();
  if (v.includes("boeuf") || v.includes("bœuf") || v.includes("agneau") || v.includes("veau")) return "🥩";
  if (v.includes("porc") || v.includes("jambon") || v.includes("lard")) return "🥓";
  if (v.includes("poulet") || v.includes("dinde") || v.includes("volaille") || v.includes("canard")) return "🍗";
  if (v.includes("poisson") || v.includes("saumon") || v.includes("thon") || v.includes("cabillaud") || v.includes("fruits de mer") || v.includes("crevette")) return "🐟";
  if (v.includes("oeuf") || v.includes("œuf")) return "🥚";
  if (v.includes("fromage")) return "🧀";
  if (v.includes("tofu") || v.includes("legumineuse") || v.includes("légumineuse") || v.includes("vege") || v.includes("végé")) return "🥦";
  return "🍽️";
}

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
  const location = useLocation();
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

  if (location.pathname !== "/recettes") return <Outlet />;

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {(data ?? []).map((r: any) => (
          <Link
            key={r.id}
            to="/recettes/$id"
            params={{ id: r.id }}
            className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 hover:shadow-sm transition flex flex-col gap-1.5"
          >
            <h2 className="font-semibold leading-tight text-sm flex items-start gap-1.5">
              <span className="text-base leading-none mt-0.5" aria-hidden>{proteinEmoji(r.protein)}</span>
              <span className="flex-1 line-clamp-2">{r.title}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground">
              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">Familial</span>
              {r.protein && <span className="bg-accent/50 px-1.5 py-0.5 rounded-full capitalize">{r.protein}</span>}
              {r.cuisine_style && <span className="bg-secondary/60 px-1.5 py-0.5 rounded-full capitalize">{r.cuisine_style}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3"/>{r.prep_time} min</span>
              {r.calories != null && <span className="inline-flex items-center gap-1"><Flame className="w-3 h-3"/>{r.calories} kcal</span>}
            </div>
            {r.vegetables && r.vegetables.length > 0 && (
              <p className="text-[11px] text-muted-foreground inline-flex items-start gap-1 line-clamp-1"><Carrot className="w-3 h-3 mt-0.5 shrink-0"/><span className="line-clamp-1">{r.vegetables.slice(0, 5).join(", ")}</span></p>
            )}
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