import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listMealPlan, upsertMealPlan, removeMealPlan, generateWeekPlan, clearWeekPlan } from "@/lib/planning.functions";
import { listMyRecipes } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { CalendarDays, X, ChevronLeft, ChevronRight, Plus, Sparkles, Download, Trash2, Repeat } from "lucide-react";
import { generateWeekPlanPdf } from "@/lib/planning-pdf";
import { COURSE_TYPES, type CourseTypeId } from "@/lib/constants";

export const Route = createFileRoute("/planning")({
  head: () => ({ meta: [{ title: "Planning — MiamPlan" }] }),
  component: PlanningPage,
});

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

type Slot = "soir" | "entree" | "soupe" | "dessert";
const EXTRA_SLOTS: { slot: Exclude<Slot, "soir">; label: string; courseType: CourseTypeId }[] = [
  { slot: "entree", label: "Entrée", courseType: "entree" },
  { slot: "soupe", label: "Soupe", courseType: "soupe" },
  { slot: "dessert", label: "Dessert", courseType: "dessert" },
];
const SLOT_LABEL: Record<Slot, string> = {
  soir: "Dîner",
  entree: "Entrée",
  soupe: "Soupe",
  dessert: "Dessert",
};

function PlanningPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const listPlan = useServerFn(listMealPlan);
  const upsert = useServerFn(upsertMealPlan);
  const remove = useServerFn(removeMealPlan);
  const listRec = useServerFn(listMyRecipes);
  const fillWeekFn = useServerFn(generateWeekPlan);
  const clearWeekFn = useServerFn(clearWeekPlan);
  const [filling, setFilling] = useState(false);

  const { data: plan } = useQuery({
    queryKey: ["plan", weekStartStr],
    queryFn: () => listPlan({ data: { week_start: weekStartStr } }),
    enabled: !!user,
  });

  const [picker, setPicker] = useState<{ date: string; slot: Slot; courseType: CourseTypeId; replaceId?: string } | null>(null);

  const { data: pickerRecipes } = useQuery({
    queryKey: ["recipes-by-course", picker?.courseType],
    queryFn: () => listRec({ data: { course_type: picker!.courseType } }),
    enabled: !!user && !!picker,
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
    mutationFn: (v: { date: string; slot: Slot; recipe_id: string }) => upsert({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan", weekStartStr] }),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan", weekStartStr] }),
  });

  async function autoFillWeek(replace: boolean) {
    if (filling) return;
    if (replace && !window.confirm("Remplacer les dîners déjà planifiés cette semaine ?")) return;
    setFilling(true);
    try {
      const res = await fillWeekFn({ data: { week_start: weekStartStr, slots: ["soir"], replace } });
      toast.success(`${res.inserted} dîners ajoutés à la semaine`);
      qc.invalidateQueries({ queryKey: ["plan", weekStartStr] });
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    } finally {
      setFilling(false);
    }
  }

  async function clearWeek() {
    if (!window.confirm("Vider entièrement le planning de cette semaine ?")) return;
    try {
      await clearWeekFn({ data: { week_start: weekStartStr } });
      toast.success("Semaine vidée");
      qc.invalidateQueries({ queryKey: ["plan", weekStartStr] });
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    }
  }

  function downloadPdf() {
    if (!plan?.length) {
      toast.error("Le planning est vide");
      return;
    }
    try {
      generateWeekPlanPdf(weekStartStr, plan as any);
      toast.success("PDF téléchargé");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur PDF");
    }
  }

  if (!user) {
    return (
      <div className="text-center py-16">
        <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Connectez-vous pour planifier vos repas.</p>
        <Link to="/auth" className="bg-primary text-primary-foreground px-4 py-2 rounded-full">Se connecter</Link>
      </div>
    );
  }

  function entriesFor(date: string): { dinner: any | null; extras: any[] } {
    const all = (plan ?? []).filter((p: any) => p.date === date);
    const dinner = all.find((p: any) => p.slot === "soir") ?? null;
    const extras = all.filter((p: any) => p.slot !== "soir" && p.slot !== "matin" && p.slot !== "midi");
    return { dinner, extras };
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => autoFillWeek(false)}
          disabled={filling}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium inline-flex items-center gap-2 disabled:opacity-60"
        >
          <Sparkles className="w-4 h-4" />{filling ? "L'IA compose…" : "Remplir ma semaine (IA)"}
        </button>
        <button
          onClick={() => autoFillWeek(true)}
          disabled={filling}
          className="border border-border px-3 py-2 rounded-full text-sm inline-flex items-center gap-2 disabled:opacity-60"
        >
          Régénérer tout
        </button>
        <button
          onClick={clearWeek}
          className="border border-border px-3 py-2 rounded-full text-sm inline-flex items-center gap-2 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />Vider la semaine
        </button>
        <button
          onClick={downloadPdf}
          className="border border-border px-3 py-2 rounded-full text-sm inline-flex items-center gap-2"
        >
          <Download className="w-4 h-4" />PDF
        </button>
      </div>

      <div className="space-y-3">
        {days.map((d, i) => {
          const dateStr = d.toISOString().slice(0, 10);
          const isToday = dateStr === new Date().toISOString().slice(0, 10);
          const { dinner, extras } = entriesFor(dateStr);
          const usedSlots = new Set<string>(extras.map((e: any) => e.slot));
          return (
            <div key={dateStr} className={`bg-card border rounded-2xl p-4 ${isToday ? "border-primary" : "border-border"}`}>
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{DAY_LABELS[i]}</div>
                  <div className="text-lg font-semibold">{d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</div>
                </div>
                {isToday && <span className="text-[10px] uppercase bg-primary/15 text-primary px-2 py-0.5 rounded-full">Aujourd'hui</span>}
              </div>

              {/* Main dinner */}
              <div className="mb-2">
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Dîner</div>
                {dinner ? (
                  <div className="bg-secondary/40 rounded-lg p-3 flex items-start justify-between gap-2">
                    <Link to="/recettes/$id" params={{ id: dinner.recipe_id }} className="flex-1 min-w-0">
                      <div className="font-medium leading-tight">{dinner.recipes?.title ?? "Recette"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {[dinner.recipes?.cuisine_style, dinner.recipes?.prep_time ? `${dinner.recipes.prep_time} min` : null].filter(Boolean).join(" · ")}
                      </div>
                    </Link>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setPicker({ date: dateStr, slot: "soir", courseType: "plat", replaceId: dinner.id })}
                        className="p-1.5 rounded hover:bg-background/60"
                        title="Remplacer"
                      >
                        <Repeat className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => removeMut.mutate(dinner.id)}
                        className="p-1.5 rounded hover:bg-destructive/20 text-destructive"
                        title="Supprimer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setPicker({ date: dateStr, slot: "soir", courseType: "plat" })}
                    className="w-full text-sm text-muted-foreground border border-dashed border-border rounded-lg p-3 hover:border-primary hover:text-primary flex items-center justify-center gap-1"
                  >
                    <Plus className="w-4 h-4" />Choisir un plat principal
                  </button>
                )}
              </div>

              {/* Extras */}
              {extras.length > 0 && (
                <div className="space-y-1.5 mt-3">
                  {extras.map((e: any) => (
                    <div key={e.id} className="bg-muted/40 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                      <Link to="/recettes/$id" params={{ id: e.recipe_id }} className="flex-1 min-w-0 text-sm">
                        <span className="text-[10px] uppercase text-muted-foreground mr-2">{SLOT_LABEL[e.slot as Slot] ?? e.slot}</span>
                        <span className="font-medium">{e.recipes?.title ?? "Recette"}</span>
                      </Link>
                      <button
                        onClick={() => removeMut.mutate(e.id)}
                        className="p-1 rounded hover:bg-destructive/20 text-destructive shrink-0"
                        title="Supprimer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add extras */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {EXTRA_SLOTS.filter((s) => !usedSlots.has(s.slot)).map((s) => (
                  <button
                    key={s.slot}
                    onClick={() => setPicker({ date: dateStr, slot: s.slot, courseType: s.courseType })}
                    className="text-xs text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary rounded-full px-2.5 py-1 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />{s.label}
                  </button>
                ))}
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
            <h3 className="font-bold mb-1">
              {picker.replaceId ? "Remplacer par" : `Ajouter ${SLOT_LABEL[picker.slot].toLowerCase()}`}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              {COURSE_TYPES.find((c) => c.id === picker.courseType)?.label}
            </p>
            <div className="space-y-1">
              {(pickerRecipes ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Aucune recette de ce type dans votre bibliothèque. <Link to="/generer" className="text-primary hover:underline">Générer une recette →</Link>
                </p>
              )}
              {(pickerRecipes ?? []).map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => {
                    upsertMut.mutate({ date: picker.date, slot: picker.slot, recipe_id: r.id });
                    setPicker(null);
                    toast.success(picker.replaceId ? "Recette remplacée" : "Ajouté au planning");
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
