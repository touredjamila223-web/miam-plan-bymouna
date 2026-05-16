import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { generateBatch } from "@/lib/planning.functions";
import { useAuth } from "@/hooks/use-auth";
import { ChefHat, Sparkles, Timer, Layers } from "lucide-react";

export const Route = createFileRoute("/batch")({
  head: () => ({ meta: [{ title: "Batch cooking — MiamPlan" }] }),
  component: BatchPage,
});

function BatchPage() {
  const { user } = useAuth();
  const gen = useServerFn(generateBatch);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<any>(null);

  async function run() {
    setLoading(true);
    try { setPlan(await gen()); }
    catch (e: any) { toast.error(e.message ?? "Erreur"); }
    finally { setLoading(false); }
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
        <p className="text-muted-foreground">Cuisinez 2-3h le dimanche, mangez bien toute la semaine.</p>
      </header>

      <button onClick={run} disabled={loading} className="w-full md:w-auto bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-6 py-3 rounded-full font-medium flex items-center justify-center gap-2 disabled:opacity-50">
        <Sparkles className="w-5 h-5" />{loading ? "L'IA prépare votre session..." : "Générer ma session batch"}
      </button>

      {plan && (
        <div className="space-y-6">
          <section className="bg-card border border-border rounded-2xl p-5">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">{plan.title}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1"><Timer className="w-4 h-4" />~{plan.total_time} min de cuisine</p>
          </section>

          <section>
            <h3 className="font-semibold mb-3">Bases à préparer</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {plan.bases?.map((b: any, i: number) => (
                <div key={i} className="bg-card border border-border rounded-xl p-3">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-muted-foreground">{b.qty}</div>
                  <div className="text-xs mt-2"><span className="text-muted-foreground">Réutilisé dans :</span> {b.use_in.join(", ")}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-3">Étapes parallèles</h3>
            <div className="space-y-3">
              {plan.parallel_steps?.map((s: any, i: number) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4">
                  <div className="text-xs font-medium text-primary mb-2">{s.time_block}</div>
                  <ul className="space-y-1">
                    {s.tasks.map((t: string, j: number) => (
                      <li key={j} className="text-sm flex gap-2">• {t}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold mb-3">Repas de la semaine</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {plan.meals?.map((m: any, i: number) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4">
                  <div className="text-xs text-muted-foreground uppercase">{m.day} · {m.slot}</div>
                  <div className="font-semibold mb-2">{m.title}</div>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    {m.finish_steps.map((f: string, j: number) => <li key={j}>– {f}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
