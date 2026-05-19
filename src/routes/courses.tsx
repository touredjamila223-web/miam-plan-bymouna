import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listShopping,
  addShoppingItem,
  toggleShoppingItem,
  removeShoppingItem,
  clearCheckedShopping,
  clearAllShopping,
  generateShoppingFromPlan,
  consolidateShopping,
} from "@/lib/planning.functions";
import { useAuth } from "@/hooks/use-auth";
import { ShoppingCart, Plus, X, Sparkles, Trash2, FileDown, RotateCcw, Combine } from "lucide-react";
import { generateShoppingPdf } from "@/lib/shopping-pdf";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/courses")({
  head: () => ({ meta: [{ title: "Courses — MiamPlan" }] }),
  component: CoursesPage,
});

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

const CATEGORY_ORDER = [
  "Fruits",
  "Legumes",
  "Viandes",
  "Poissons & fruits de mer",
  "Charcuterie",
  "Cremerie & oeufs",
  "Fromages",
  "Pates, riz & feculents",
  "Conserves",
  "Sauces & condiments",
  "Herbes & epices",
  "Huiles & vinaigres",
  "Epicerie salee",
  "Epicerie sucree",
  "Boulangerie",
  "Surgeles",
  "Boissons",
  "Aperitif",
  "Hygiene & entretien",
  "Autres",
];

function CoursesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listShopping);
  const add = useServerFn(addShoppingItem);
  const toggle = useServerFn(toggleShoppingItem);
  const remove = useServerFn(removeShoppingItem);
  const clearChecked = useServerFn(clearCheckedShopping);
  const clearAll = useServerFn(clearAllShopping);
  const gen = useServerFn(generateShoppingFromPlan);
  const dedupe = useServerFn(consolidateShopping);

  const { data: items } = useQuery({
    queryKey: ["shopping"],
    queryFn: () => list(),
    enabled: !!user,
  });

  const [item, setItem] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<null | { groups: Array<{ item: string; category: string; mergedQty: string; sources: Array<{ item: string; qty: string | null }> }>; removed: number }>(null);
  const [applying, setApplying] = useState(false);

  const addMut = useMutation({
    mutationFn: (v: string) => add({ data: { item: v } }),
    onSuccess: () => { setItem(""); qc.invalidateQueries({ queryKey: ["shopping"] }); },
  });
  const toggleMut = useMutation({
    mutationFn: (v: { id: string; checked: boolean }) => toggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
  });

  async function runGenerate() {
    setLoading(true);
    try {
      const ws = startOfWeek(new Date()).toISOString().slice(0, 10);
      await gen({ data: { week_start: ws } });
      toast.success("Liste générée depuis le planning");
      qc.invalidateQueries({ queryKey: ["shopping"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    } finally { setLoading(false); }
  }

  async function clearDone() {
    await clearChecked();
    qc.invalidateQueries({ queryKey: ["shopping"] });
  }

  async function resetAll() {
    await clearAll();
    toast.success("Liste réinitialisée");
    qc.invalidateQueries({ queryKey: ["shopping"] });
  }

  async function runDedupe() {
    try {
      const r = await dedupe();
      if (r.removed > 0) toast.success(`${r.removed} doublon${r.removed > 1 ? "s" : ""} fusionné${r.removed > 1 ? "s" : ""}`);
      else toast.success("Aucun doublon détecté");
      qc.invalidateQueries({ queryKey: ["shopping"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    }
  }

  function exportPdf() {
    if (!items?.length) {
      toast.error("Liste vide");
      return;
    }
    generateShoppingPdf(items as any);
  }

  if (!user) {
    return (
      <div className="text-center py-16">
        <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Connectez-vous pour gérer vos courses.</p>
        <Link to="/auth" className="bg-primary text-primary-foreground px-4 py-2 rounded-full">Se connecter</Link>
      </div>
    );
  }

  const grouped: Record<string, any[]> = {};
  for (const it of items ?? []) {
    const cat = it.category || "Autres";
    (grouped[cat] = grouped[cat] || []).push(it);
  }
  const orderedCats = Object.keys(grouped).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><ShoppingCart className="w-7 h-7 text-primary" />Liste de courses</h1>
          <p className="text-muted-foreground">Consolidée depuis votre planning, cochez en faisant les courses.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runGenerate} disabled={loading} className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm flex items-center gap-2 disabled:opacity-50"><Sparkles className="w-4 h-4" />{loading ? "..." : "Depuis le planning"}</button>
          <button onClick={runDedupe} className="border border-border px-3 py-2 rounded-full text-sm flex items-center gap-2 hover:bg-accent/20"><Combine className="w-4 h-4" />Fusionner doublons</button>
          <button onClick={exportPdf} className="border border-border px-3 py-2 rounded-full text-sm flex items-center gap-2 hover:bg-accent/20"><FileDown className="w-4 h-4" />PDF</button>
          <button onClick={clearDone} className="border border-border px-3 py-2 rounded-full text-sm flex items-center gap-2 hover:bg-accent/20"><Trash2 className="w-4 h-4" />Vider cochés</button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="border border-destructive/40 text-destructive px-3 py-2 rounded-full text-sm flex items-center gap-2 hover:bg-destructive/10"><RotateCcw className="w-4 h-4" />Réinitialiser</button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Réinitialiser la liste ?</AlertDialogTitle>
                <AlertDialogDescription>Tous les articles seront supprimés. Cette action est irréversible.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={resetAll}>Réinitialiser</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); if (item.trim()) addMut.mutate(item.trim()); }} className="flex gap-2 bg-card border border-border rounded-2xl p-3">
        <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Ajouter un article" className="flex-1 px-3 py-2 bg-background border border-border rounded-lg" />
        <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2"><Plus className="w-4 h-4" />Ajouter</button>
      </form>

      <div className="space-y-5">
        {orderedCats.map((cat) => (
          <section key={cat}>
            <h2 className="text-sm uppercase tracking-wide text-muted-foreground mb-2 font-medium">{cat}</h2>
            <ul className="bg-card border border-border rounded-2xl divide-y divide-border">
              {grouped[cat].map((it) => (
                <li key={it.id} className="flex items-center gap-3 px-4 py-3 group">
                  <input type="checkbox" checked={!!it.checked} onChange={(e) => toggleMut.mutate({ id: it.id, checked: e.target.checked })} className="w-5 h-5 accent-primary" />
                  <div className={`flex-1 ${it.checked ? "line-through text-muted-foreground" : ""}`}>
                    <span className="font-medium">{it.item}</span>{it.qty && <span className="text-muted-foreground text-sm ml-2">{it.qty}</span>}
                  </div>
                  <button onClick={() => removeMut.mutate(it.id)} className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!items?.length && (
          <p className="text-center text-muted-foreground py-12">Liste vide — ajoutez des articles ou générez depuis votre planning.</p>
        )}
      </div>
    </div>
  );
}
