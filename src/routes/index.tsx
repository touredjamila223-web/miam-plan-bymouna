import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyRecipes } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { Sparkles, Refrigerator, CalendarDays, BookOpen, ChefHat } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MiamPlan — Cuisinez sainement en famille" },
      { name: "description", content: "Recettes guidées, batch cooking et planning hebdomadaire pour votre famille." },
    ],
  }),
  component: Home,
});

const SHORTCUTS = [
  { to: "/recettes", label: "Bibliothèque", desc: "Toutes les recettes", icon: BookOpen },
  { to: "/generer", label: "Générer", desc: "Une recette sur mesure", icon: Sparkles },
  { to: "/frigo", label: "Mon frigo", desc: "Que cuisiner avec ?", icon: Refrigerator },
  { to: "/planning", label: "Planning", desc: "La semaine en un coup d'œil", icon: CalendarDays },
] as const;

function Home() {
  const { user } = useAuth();
  const listMine = useServerFn(listMyRecipes);
  const { data: recipes } = useQuery({
    queryKey: ["recipes", "mine", !!user],
    enabled: !!user,
    queryFn: () => listMine({ data: {} }),
  });

  return (
    <div className="space-y-10">
      <section className="rounded-3xl bg-gradient-to-br from-primary/15 via-accent/20 to-secondary/30 p-8 md:p-12">
        <div className="flex items-center gap-2 text-primary mb-3">
          <ChefHat className="w-5 h-5" /><span className="text-sm font-medium">MiamPlan</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3">Cuisinez bien,<br/>vivez mieux.</h1>
        <p className="text-muted-foreground max-w-xl mb-6">Votre compagnon culinaire familial : recettes guidées, batch cooking malin et planning facile.</p>
        <div className="flex flex-wrap gap-3">
          <Link to="/generer" className="bg-primary text-primary-foreground px-5 py-3 rounded-full font-medium hover:opacity-90 transition flex items-center gap-2"><Sparkles className="w-4 h-4"/>Générer une recette</Link>
          <Link to="/recettes" className="bg-card border border-border px-5 py-3 rounded-full font-medium hover:bg-accent/20 transition">Explorer les recettes</Link>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">Accès rapide</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SHORTCUTS.map((s) => (
            <Link key={s.to} to={s.to} className="bg-card border border-border rounded-2xl p-4 hover:shadow-md hover:border-primary/30 transition group">
              <s.icon className="w-6 h-6 text-primary mb-2 group-hover:scale-110 transition" />
              <div className="font-semibold">{s.label}</div>
              <div className="text-xs text-muted-foreground">{s.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-2xl font-bold">Recettes à découvrir</h2>
          <Link to="/recettes" className="text-sm text-primary hover:underline">Tout voir →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(recipes ?? []).slice(0, 6).map((r: any) => (
            <Link key={r.id} to="/recettes/$id" params={{ id: r.id }} className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition">
              <div className="aspect-[4/3] bg-gradient-to-br from-accent/40 to-secondary/40 flex items-center justify-center">
                <ChefHat className="w-12 h-12 text-primary/40" />
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span className="bg-secondary/50 px-2 py-0.5 rounded-full">{r.cuisine_style}</span>
                  <span>{r.prep_time} min</span>
                </div>
                <h3 className="font-semibold text-base leading-tight">{r.title}</h3>
                {r.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
              </div>
            </Link>
          ))}
          {(!recipes || recipes.length === 0) && (
            <div className="col-span-full bg-card border border-dashed border-border rounded-2xl p-8 text-center space-y-3">
              <p className="text-muted-foreground">Ta bibliothèque est encore vide. Génère 4 recettes en un clic et sauvegarde celles qui te plaisent.</p>
              <Link to="/generer" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium"><Sparkles className="w-4 h-4"/>Démarrer ma bibliothèque</Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}