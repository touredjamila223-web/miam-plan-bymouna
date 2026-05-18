import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { generateBatch } from "@/lib/planning.functions";
import { useAuth } from "@/hooks/use-auth";
import { ChefHat, Sparkles, Timer, Layers, Play, RotateCcw, CheckSquare, Cpu } from "lucide-react";

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
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()).toISOString().slice(0, 10));

  // Restore last generated session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("batch_session");
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.plan) {
          setPlan(saved.plan);
          if (saved.week_start) setWeekStart(saved.week_start);
        }
      }
    } catch {}
  }, []);

  async function run() {
    setLoading(true);
    try {
      const p = await gen({ data: { week_start: weekStart } });
      setPlan(p);
      try { localStorage.setItem("batch_session", JSON.stringify({ plan: p, week_start: weekStart })); } catch {}
      if ((p as any)?.ai_fallback) {
        toast.warning("Session créée sans optimisation IA avancée : le service IA a refusé l’appel, mais tes repas sont conservés.");
      }
    }
    catch (e: any) {
      const message = e.message === "Payment Required"
        ? "Le service IA a refusé l’appel côté application. Tes crédits Lovable de construction ne sont pas en cause."
        : e.message ?? "Erreur";
      toast.error(message);
    }
    finally { setLoading(false); }
  }

  function reset() {
    setPlan(null);
    try { localStorage.removeItem("batch_session"); } catch {}
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
        <p className="text-muted-foreground">Une seule session le week-end : tous les plats de la semaine sont cuits, portionnés et rangés. Le soir, il ne reste qu'à réchauffer.</p>
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
          <Sparkles className="w-5 h-5" />{loading ? "L'IA prépare votre session..." : plan ? "Régénérer la session" : "Générer ma session batch"}
        </button>
        {plan && (
          <button onClick={reset} className="w-full sm:w-auto text-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-2">
            <RotateCcw className="w-3.5 h-3.5" />Réinitialiser la session
          </button>
        )}
        <p className="text-xs text-muted-foreground">
          L'IA s'appuie sur les repas que tu as planifiés cette semaine dans <Link to="/planning" className="text-primary underline">Planning</Link>.
        </p>
      </div>

      {plan && (
        <div className="space-y-6">
          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-xl font-bold mb-1">{plan.title}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1"><Timer className="w-4 h-4" />~{plan.total_time} min de cuisine</p>
            {plan.ai_fallback ? <p className="text-xs text-muted-foreground mt-2">Plan de secours généré automatiquement à partir de tes repas, car le service IA n'a pas accepté l'appel.</p> : null}
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={startCooking} className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full font-medium inline-flex items-center gap-2">
                <Play className="w-4 h-4" />Démarrer la session
              </button>
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Cpu className="w-4 h-4" />Plan de cuisson (ordre optimisé)</h3>
            <div className="space-y-2">
              {[...(plan.cooked_meals ?? [])].sort((a: any, b: any) => a.start_at_minute - b.start_at_minute).map((m: any, i: number) => (
                <div key={i} className="bg-card border border-border rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{m.title}</div>
                    <div className="text-xs text-muted-foreground shrink-0">T+{m.start_at_minute} min · {m.duration_minutes} min</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium text-foreground">{m.appliance}</span>
                    {m.program ? ` · ${m.program}` : ""}
                    {m.temperature ? ` · ${m.temperature}` : ""}
                  </div>
                  {m.notes ? <div className="text-xs mt-1">{m.notes}</div> : null}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-3">Déroulé de la session (en parallèle)</h3>
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
            <h3 className="font-semibold mb-3 flex items-center gap-2"><CheckSquare className="w-4 h-4" />Checklist de fin de session</h3>
            <div className="space-y-1">
              {plan.final_checklist?.map((c: any, i: number) => (
                <div key={i} className="text-sm bg-card border border-border rounded-lg px-3 py-2">☐ {c.label}</div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-3">Repas couverts cette semaine</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {plan.meals?.map((m: any) => (
                <div key={m.recipe_id + m.date} className="bg-card border border-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground uppercase">{m.day} · {m.slot}</div>
                  <Link to="/recettes/$id" params={{ id: m.recipe_id }} className="font-semibold hover:text-primary">{m.title}</Link>
                  <div className="text-xs text-muted-foreground mt-1">À réchauffer le jour J</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
