import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { generateBatch, saveBatchSession } from "@/lib/planning.functions";
import { useAuth } from "@/hooks/use-auth";
import { ChefHat, Sparkles, Timer, Layers, ShoppingCart, Play } from "lucide-react";

export const Route = createFileRoute("/batch")({
  head: () => ({ meta: [{ title: "Batch cooking — MiamPlan" }] }),
  component: BatchPage,
});

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function BatchPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const gen = useServerFn(generateBatch);
  const save = useServerFn(saveBatchSession);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()).toISOString().slice(0, 10));

  async function run() {
    setLoading(true);
    try { setPlan(await gen({ data: { week_start: weekStart } })); }
    catch (e: any) { toast.error(e.message ?? "Erreur"); }
    finally { setLoading(false); }
  }

  async function handleSave() {
    if (!plan) return;
    setSaving(true);
    try {
      const res = await save({ data: { bases: plan.bases ?? [] } });
      toast.success(`${res.shopping_inserted} bases ajoutées à la liste de courses`);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function startCooking() {
    if (!plan) return;
    sessionStorage.setItem("batch_session", JSON.stringify(plan));
    nav({ to: "/batch/cuisine" });
  }

  if (!user) {
    return (
      <div className="text-center py-16">
        <ChefHat className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Connectez-vous pour générer une session batch.</p>
        <Link to="/auth" className="bg-primary text-primary-foreground px-4 py-2 rounded-full">Se connecter</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Layers className="w-7 h-7 text-primary" />Batch cooking</h1>
        <p className="text-muted-foreground">Cuisinez 2-3h le dimanche pour les repas déjà planifiés cette semaine.</p>
      </header>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <label className="block text-sm">
          <span className="block text-muted-foreground mb-1">Semaine à préparer</span>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(startOfWeek(new Date(e.target.value)).toISOString().slice(0, 10))}
            className="w-full sm:w-auto bg-background border border-border rounded-lg px-3 py-2"
          />
        </label>
        <button onClick={run} disabled={loading} className="w-full sm:w-auto bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-6 py-3 rounded-full font-medium flex items-center justify-center gap-2 disabled:opacity-50">
          <Sparkles className="w-5 h-5" />{loading ? "L'IA prépare votre session..." : "Générer ma session batch"}
        </button>
        <p className="text-xs text-muted-foreground">
          L'IA s'appuie sur les repas que tu as planifiés cette semaine dans <Link to="/planning" className="text-primary underline">Planning</Link>.
        </p>
      </div>

      {plan && (
        <div className="space-y-6">
          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-xl font-bold mb-1">{plan.title}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1"><Timer className="w-4 h-4" />~{plan.total_time} min de cuisine</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={startCooking} className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full font-medium inline-flex items-center gap-2">
                <Play className="w-4 h-4" />Démarrer la session
              </button>
              <button onClick={handleSave} disabled={saving} className="bg-secondary text-secondary-foreground px-5 py-2.5 rounded-full font-medium inline-flex items-center gap-2 disabled:opacity-50">
                <ShoppingCart className="w-4 h-4" />{saving ? "..." : "Ajouter les bases aux courses"}
              </button>
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-3">Bases à préparer</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {plan.bases?.map((b: any, i: number) => (
                <div key={i} className="bg-card border border-border rounded-xl p-3">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.qty}</div>
                  {b.use_in?.length ? (
                    <div className="text-xs mt-2"><span className="text-muted-foreground">Pour :</span> {b.use_in.join(", ")}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-3">Déroulé de la session (étapes parallèles)</h3>
            <div className="space-y-3">
              {plan.parallel_steps?.map((s: any, i: number) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4">
                  <div className="text-xs font-medium text-primary mb-2">{s.time_block} · {s.duration_minutes} min</div>
                  <ul className="space-y-1">
                    {s.tasks.map((t: string, j: number) => (
                      <li key={j} className="text-sm">• {t}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-3">Repas couverts cette semaine</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {plan.meals?.map((m: any) => {
                const finish = plan.meal_finishes?.find((f: any) => f.recipe_id === m.recipe_id);
                return (
                  <div key={m.recipe_id + m.date} className="bg-card border border-border rounded-xl p-4">
                    <div className="text-xs text-muted-foreground uppercase">{m.day} · {m.slot}</div>
                    <Link to="/recettes/$id" params={{ id: m.recipe_id }} className="font-semibold hover:text-primary">{m.title}</Link>
                    {finish ? (
                      <ul className="text-sm space-y-1 text-muted-foreground mt-2">
                        {finish.finish_steps.map((f: string, j: number) => <li key={j}>– {f}</li>)}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
