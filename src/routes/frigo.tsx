import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listFridge,
  addFridgeItem,
  removeFridgeItem,
  suggestFromFridge,
} from "@/lib/planning.functions";
import { saveRecipes } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { Refrigerator, Plus, X, Sparkles, RefreshCw, Save, Clock, Flame, Carrot, ChefHat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/frigo")({
  head: () => ({ meta: [{ title: "Mon frigo — MiamPlan" }] }),
  component: FrigoPage,
});

function FrigoPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listFridge);
  const add = useServerFn(addFridgeItem);
  const remove = useServerFn(removeFridgeItem);
  const suggest = useServerFn(suggestFromFridge);
  const save = useServerFn(saveRecipes);

  const { data: items } = useQuery({
    queryKey: ["fridge"],
    queryFn: () => list(),
    enabled: !!user,
  });

  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [suggestions, setSuggestions] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);

  const addMut = useMutation({
    mutationFn: (v: { name: string; qty: string }) =>
      add({ data: { name: v.name, qty: v.qty || undefined } }),
    onSuccess: () => {
      setName(""); setQty("");
      qc.invalidateQueries({ queryKey: ["fridge"] });
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fridge"] }),
  });

  async function runSuggest() {
    setLoading(true);
    setSelected({});
    setSuggestions(null);
    try {
      const s = await suggest();
      setSuggestions(s);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    } finally { setLoading(false); }
  }

  async function onSaveSelected() {
    if (!suggestions) return;
    const picks = suggestions.filter((_, i) => selected[i]);
    if (!picks.length) return toast.error("Sélectionne au moins une recette");
    try {
      await save({ data: { recipes: picks.map((r) => ({ ...r, source: "ai" })) } });
      toast.success(`${picks.length} recette(s) ajoutée(s) à ta bibliothèque !`);
      setSuggestions(null);
      setSelected({});
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  if (!user) {
    return (
      <div className="text-center py-16">
        <Refrigerator className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Connectez-vous pour utiliser le frigo intelligent.</p>
        <Link to="/auth" className="bg-primary text-primary-foreground px-4 py-2 rounded-full">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Refrigerator className="w-7 h-7 text-primary" />Mon frigo</h1>
        <p className="text-muted-foreground">Indiquez ce que vous avez, l'IA propose des recettes adaptées.</p>
      </header>

      <section className="bg-card border border-border rounded-2xl p-4">
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) addMut.mutate({ name: name.trim(), qty: qty.trim() }); }}
          className="flex flex-wrap gap-2 mb-4"
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ingrédient (ex: poulet)" className="flex-1 min-w-[160px] border border-border rounded-lg px-3 py-2 bg-background" />
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qté (optionnel)" className="w-32 border border-border rounded-lg px-3 py-2 bg-background" />
          <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50" disabled={addMut.isPending}><Plus className="w-4 h-4" />Ajouter</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {(items ?? []).map((it: any) => (
            <span key={it.id} className="inline-flex items-center gap-2 bg-secondary/40 px-3 py-1.5 rounded-full text-sm">
              {it.name}{it.qty && <span className="text-muted-foreground">· {it.qty}</span>}
              <button onClick={() => removeMut.mutate(it.id)} className="hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
          {!items?.length && <p className="text-sm text-muted-foreground">Votre frigo est vide pour l'instant.</p>}
        </div>
      </section>

      <section>
        <button onClick={runSuggest} disabled={loading || !items?.length} className="w-full md:w-auto bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-6 py-3 rounded-full font-medium flex items-center justify-center gap-2 disabled:opacity-50">
          <Sparkles className="w-5 h-5" />{loading ? "L'IA cherche..." : "Proposer des recettes"}
        </button>
      </section>

      {suggestions && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-xl font-bold">Suggestions</h2>
            <div className="flex gap-2">
              <button onClick={runSuggest} disabled={loading} className="text-sm border border-border px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50"><RefreshCw className="w-3.5 h-3.5"/>Tout écarter</button>
              <button onClick={onSaveSelected} disabled={!Object.values(selected).some(Boolean)} className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 disabled:opacity-50"><Save className="w-3.5 h-3.5"/>Sauvegarder la sélection</button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Coche celles qui te plaisent pour les ajouter à ta bibliothèque, puis va les cuisiner.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {suggestions.map((s, i) => {
              const isSel = !!selected[i];
              return (
                <label key={i} className={`bg-card border rounded-2xl p-4 cursor-pointer transition block ${isSel ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox checked={isSel} onCheckedChange={(v) => setSelected((st) => ({ ...st, [i]: !!v }))} className="mt-1"/>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground mb-1">
                        <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">Familial</span>
                        <span className="bg-accent/50 px-1.5 py-0.5 rounded-full capitalize">{s.protein}</span>
                        <span className="bg-secondary/60 px-1.5 py-0.5 rounded-full capitalize">{s.cuisine_style}</span>
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3"/>{s.prep_time} min</span>
                        {s.calories != null && <span className="inline-flex items-center gap-1"><Flame className="w-3 h-3"/>{s.calories} kcal</span>}
                      </div>
                      <h3 className="font-bold leading-tight flex items-center gap-2"><ChefHat className="w-4 h-4 text-primary"/>{s.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                      {s.vegetables?.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1.5 inline-flex items-center gap-1"><Carrot className="w-3 h-3"/>{s.vegetables.join(", ")}</p>
                      )}
                      {s.missing_ingredients?.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2"><span className="font-medium">À acheter :</span> {s.missing_ingredients.join(", ")}</p>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
