import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCookedHistory, updateCooked, deleteCooked } from "@/lib/cooking.functions";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { History, Star, Heart, ChefHat, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/historique")({
  head: () => ({ meta: [{ title: "Recettes réalisées — MiamPlan" }] }),
  component: HistoriquePage,
});

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star className={`w-6 h-6 ${n <= value ? "fill-primary text-primary" : "text-muted-foreground"}`} />
        </button>
      ))}
    </div>
  );
}

function HistoriquePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listCookedHistory);
  const update = useServerFn(updateCooked);
  const remove = useServerFn(deleteCooked);
  const { data: rows, isLoading } = useQuery({ queryKey: ["history"], queryFn: () => list(), enabled: !!user });

  const [editing, setEditing] = useState<any | null>(null);
  const [taste, setTaste] = useState(5);
  const [ease, setEase] = useState(5);
  const [loved, setLoved] = useState(false);
  const [comment, setComment] = useState("");

  function openEdit(h: any) {
    setEditing(h);
    setTaste(h.taste_rating ?? 5);
    setEase(h.ease_rating ?? 5);
    setLoved(!!h.family_loved);
    setComment(h.comment ?? "");
  }

  const updMut = useMutation({
    mutationFn: () =>
      update({ data: { id: editing.id, taste_rating: taste, ease_rating: ease, family_loved: loved, comment: comment || null } }),
    onSuccess: () => {
      toast.success("Avis mis à jour");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["history"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erreur"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Avis supprimé");
      qc.invalidateQueries({ queryKey: ["history"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erreur"),
  });

  if (!user) {
    return (
      <div className="text-center py-16">
        <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Connectez-vous pour suivre votre historique.</p>
        <Link to="/auth" className="bg-primary text-primary-foreground px-4 py-2 rounded-full">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><History className="w-7 h-7 text-primary" />Recettes réalisées</h1>
        <p className="text-muted-foreground">Vos repas cuisinés et leur note. L'IA s'en sert pour mieux vous proposer.</p>
      </header>

      <div className="space-y-3">
        {isLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={`s${i}`} className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
        {(rows ?? []).map((h: any) => (
          <div key={h.id} className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
            <ChefHat className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Link to="/recettes/$id" params={{ id: h.recipe_id }} className="font-semibold hover:underline">
                  {h.recipes?.title ?? "Recette"}
                </Link>
                <div className="text-xs text-muted-foreground">{new Date(h.cooked_at).toLocaleDateString("fr-FR")}</div>
              </div>
              <div className="text-xs text-muted-foreground mb-2">{h.recipes?.cuisine_style}</div>
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <span className="inline-flex items-center gap-1">Goût {Array.from({ length: h.taste_rating }).map((_, i) => <Star key={i} className="w-3 h-3 fill-primary text-primary" />)}</span>
                <span className="inline-flex items-center gap-1">Facilité {Array.from({ length: h.ease_rating }).map((_, i) => <Star key={i} className="w-3 h-3 fill-primary text-primary" />)}</span>
                {h.family_loved && <Heart className="w-4 h-4 fill-primary text-primary" />}
              </div>
              {h.comment && <p className="text-sm text-muted-foreground mt-2 italic">« {h.comment} »</p>}
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={() => openEdit(h)}><Pencil className="w-3.5 h-3.5"/>Modifier l'avis</Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Supprimer cet avis ?")) delMut.mutate(h.id); }}>
                  <Trash2 className="w-3.5 h-3.5"/>Supprimer
                </Button>
              </div>
            </div>
          </div>
        ))}
        {!rows?.length && !isLoading && <p className="text-center text-muted-foreground py-12">Pas encore de plat cuisiné. Lancez un mode cuisine !</p>}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'avis — {editing?.recipes?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Goût</Label>
              <StarPicker value={taste} onChange={setTaste} />
            </div>
            <div>
              <Label>Facilité</Label>
              <StarPicker value={ease} onChange={setEase} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={loved} onCheckedChange={(v) => setLoved(!!v)} />
              <span className="text-sm">La famille a adoré</span>
            </label>
            <div>
              <Label>Commentaire</Label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} placeholder="Optionnel…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
            <Button onClick={() => updMut.mutate()} disabled={updMut.isPending}>
              {updMut.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
