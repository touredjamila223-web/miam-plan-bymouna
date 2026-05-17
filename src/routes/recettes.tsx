import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listMyRecipes, deleteRecipe, listRecipeIdsForRefresh, refreshRecipeSteps } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROTEINS, CUISINE_STYLES, APPLIANCES } from "@/lib/constants";
import { RecipeCompactCard } from "@/components/recipe-compact-card";
import { Search, X, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

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

const SORT_OPTIONS = [
  { v: "recent", label: "Plus récentes" },
  { v: "rated", label: "Mieux notées" },
  { v: "loved", label: "Coups de cœur" },
  { v: "todo", label: "À refaire" },
] as const;

function Recettes() {
  const location = useLocation();
  const listMine = useServerFn(listMyRecipes);
  const removeFn = useServerFn(deleteRecipe);
  const listIdsFn = useServerFn(listRecipeIdsForRefresh);
  const refreshFn = useServerFn(refreshRecipeSteps);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [protein, setProtein] = useState<string>("");
  const [cuisine, setCuisine] = useState<string>("");
  const [appliance, setAppliance] = useState<string>("");
  const [maxTime, setMaxTime] = useState<string>("0");
  const [sort, setSort] = useState<"recent" | "rated" | "loved" | "todo">("recent");
  const [bulk, setBulk] = useState<{ running: boolean; done: number; total: number; failed: number }>({
    running: false, done: 0, total: 0, failed: 0,
  });

  async function bulkRefreshSteps() {
    if (bulk.running) return;
    const ok = window.confirm(
      "Régénérer les étapes détaillées et réglages appareil de TOUTES tes recettes ? Cela peut prendre quelques minutes et consomme du crédit IA.",
    );
    if (!ok) return;
    try {
      const items = await listIdsFn();
      if (!items.length) {
        toast.info("Aucune recette à mettre à jour");
        return;
      }
      setBulk({ running: true, done: 0, total: items.length, failed: 0 });
      let done = 0;
      let failed = 0;
      for (const it of items) {
        try {
          await refreshFn({ data: { id: it.id } });
        } catch (e) {
          failed += 1;
          console.error("refresh failed", it.title, e);
        }
        done += 1;
        setBulk((b) => ({ ...b, done, failed }));
      }
      qc.invalidateQueries({ queryKey: ["recipes"] });
      qc.invalidateQueries({ queryKey: ["recipe"] });
      toast.success(`Mise à jour terminée : ${done - failed}/${items.length} recettes`);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur durant la mise à jour");
    } finally {
      setBulk((b) => ({ ...b, running: false }));
    }
  }

  const params = {
    search: search || undefined,
    protein: protein || undefined,
    cuisine: cuisine || undefined,
    appliance: appliance || undefined,
    maxTime: maxTime && maxTime !== "0" ? Number(maxTime) : undefined,
    sort,
  };
  const { data } = useQuery({
    queryKey: ["recipes", search, protein, cuisine, appliance, maxTime, sort, !!user],
    enabled: !!user,
    queryFn: () => listMine({ data: params }),
  });

  function softDelete(r: { id: string; title: string }) {
    // optimistic remove from all recipes/favorites caches
    qc.setQueriesData({ queryKey: ["recipes"] }, (old: any) =>
      Array.isArray(old) ? old.filter((x: any) => x.id !== r.id) : old,
    );
    qc.setQueriesData({ queryKey: ["favorites"] }, (old: any) =>
      Array.isArray(old) ? old.filter((x: any) => x.id !== r.id) : old,
    );
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        await removeFn({ data: { id: r.id } });
      } catch (e: any) {
        toast.error(e.message ?? "Erreur de suppression");
      } finally {
        qc.invalidateQueries({ queryKey: ["recipes"] });
        qc.invalidateQueries({ queryKey: ["favorites"] });
        qc.invalidateQueries({ queryKey: ["user-stats"] });
      }
    }, 5000);
    toast(`« ${r.title} » supprimée`, {
      duration: 5000,
      action: {
        label: "Annuler",
        onClick: () => {
          cancelled = true;
          clearTimeout(timer);
          qc.invalidateQueries({ queryKey: ["recipes"] });
          qc.invalidateQueries({ queryKey: ["favorites"] });
          toast.success("Suppression annulée");
        },
      },
    });
  }

  const hasFilters = protein || cuisine || appliance || (maxTime && maxTime !== "0");

  if (location.pathname !== "/recettes") return <Outlet />;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold mb-2">Bibliothèque</h1>
            <p className="text-muted-foreground">Toutes nos recettes adaptées à vos appareils et préférences.</p>
          </div>
          {user && (
            <Button variant="outline" size="sm" onClick={bulkRefreshSteps} disabled={bulk.running}>
              <Wand2 className="w-4 h-4" />
              {bulk.running ? `Mise à jour ${bulk.done}/${bulk.total}…` : "Mettre à jour les étapes (IA)"}
            </Button>
          )}
        </div>
        {bulk.running && (
          <div className="mt-3 space-y-1">
            <Progress value={bulk.total ? (bulk.done / bulk.total) * 100 : 0} />
            <p className="text-xs text-muted-foreground">
              {bulk.done}/{bulk.total} traitées{bulk.failed ? ` — ${bulk.failed} échec(s)` : ""}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <Input className="pl-9" placeholder="Recherche : titre, ingrédient, légume..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
          <Select value={appliance} onValueChange={(v) => setAppliance(v === "__all" ? "" : v)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Appareil"/></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tous les appareils</SelectItem>
              {APPLIANCES.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={maxTime} onValueChange={setMaxTime}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Temps"/></SelectTrigger>
            <SelectContent>
              {TIME_OPTIONS.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as any)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Trier"/></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setProtein(""); setCuisine(""); setAppliance(""); setMaxTime("0"); }}>
              <X className="w-4 h-4"/>Réinitialiser
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {(data ?? []).map((r: any) => (
          <RecipeCompactCard
            key={r.id}
            recipe={r}
            action={
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  softDelete({ id: r.id, title: r.title });
                }}
                className="p-1.5 rounded-full bg-background/80 backdrop-blur border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition"
                aria-label="Supprimer la recette"
                title="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            }
          />
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