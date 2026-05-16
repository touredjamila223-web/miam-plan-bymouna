import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listMealPlan, upsertMealPlan, removeMealPlan } from "@/lib/planning.functions";
import { listMyRecipes } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { CalendarDays, X, ChevronLeft, ChevronRight, Plus } from "lucide-react";

export const Route = createFileRoute("/planning")({
  head: () => ({ meta: [{ title: "Planning — MiamPlan" }] }),
  component: PlanningPage,
});

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SLOTS: Array<"matin" | "midi" | "soir"> = ["matin", "midi", "soir"];

function PlanningPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const listPlan = useServerFn(listMealPlan);
  const upsert = useServerFn(upsertMealPlan);
  const remove = useServerFn(removeMealPlan);
  const listRec = useServerFn(listMyRecipes);

  const { data: plan } = useQuery({
    queryKey: ["plan", weekStartStr],
    queryFn: () => listPlan({ data: { week_start: weekStartStr } }),
    enabled: !!user,
  });
  const { data: recipes } = useQuery({
    queryKey: ["recipes-all"],
    queryFn: () => listRec({ data: {} }),
    enabled: !!user,
  });

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const upsertMut = useMutation({
    mutationFn: (v: { date: string; slot: "matin" | "midi" | "soir"; recipe_id: string }) =>
      upsert({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan", weekStartStr] }),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan", weekStartStr] }),
  });

  const [picker, setPicker] = useState<{ date: string; slot: "matin" | "midi" | "soir" } | null>(null);

  if (!user) {
    return (
      <div className="text-center py-16">
        <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Connectez-vous pour planifier vos repas.</p>
        <Link to="/auth" className="bg-primary text-primary-foreground px-4 py-2 rounded-full">Se connecter</Link>
      </div>
    );
  }

  function findEntry(date: string, slot: string) {
    return (plan ?? []).find((p: any) => p.date === date && p.slot === slot);
  }

  function shiftWeek(delta: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><CalendarDays className="w-7 h-7 text-primary" />Planning</h1>
          <p className="text-muted-foreground">Semaine du {weekStart.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)} className="p-2 rounded-lg border border-border hover:bg-accent/20"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent/20">Aujourd'hui</button>
          <button onClick={() => shiftWeek(1)} className="p-2 rounded-lg border border-border hover:bg-accent/20"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
        {days.map((d, i) => {
          const dateStr = d.toISOString().slice(0, 10);
          const isToday = dateStr === new Date().toISOString().slice(0, 10);
          return (
            <div key={dateStr} className={`bg-card border rounded-2xl p-3 ${isToday ? "border-primary" : "border-border"}`}>
              <div className="text-center mb-3">
                <div className="text-xs text-muted-foreground uppercase">{DAY_LABELS[i]}</div>
                <div className="text-xl font-bold">{d.getDate()}</div>
              </div>
              <div className="space-y-2">
                {SLOTS.map((slot) => {
                  const e: any = findEntry(dateStr, slot);
                  return (
                    <div key={slot}>
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">{slot}</div>
                      {e ? (
                        <div className="bg-secondary/40 rounded-lg p-2 group relative">
                          <Link to="/recettes/$id" params={{ id: e.recipe_id }} className="text-xs font-medium leading-tight line-clamp-2 block">
                            {e.recipes?.title ?? "Recette"}
                          </Link>
                          <button onClick={() => removeMut.mutate(e.id)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <button onClick={() => setPicker({ date: dateStr, slot })} className="w-full text-xs text-muted-foreground border border-dashed border-border rounded-lg p-2 hover:border-primary hover:text-primary flex items-center justify-center gap-1"><Plus className="w-3 h-3" />Ajouter</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Link to="/courses" className="text-sm text-primary hover:underline">Générer la liste de courses →</Link>
      </div>

      {picker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4" onClick={() => setPicker(null)}>
          <div className="bg-card rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-3">Choisir une recette</h3>
            <div className="space-y-1">
              {(recipes ?? []).map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => {
                    upsertMut.mutate({ date: picker.date, slot: picker.slot, recipe_id: r.id });
                    setPicker(null);
                    toast.success("Ajouté au planning");
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent/30"
                >
                  <div className="font-medium text-sm">{r.title}</div>
                  <div className="text-xs text-muted-foreground">{r.cuisine_style} · {r.prep_time} min</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
