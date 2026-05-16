import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateRecipe, generateRecipePublic, saveRecipe } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APPLIANCES } from "@/lib/constants";
import { Sparkles, Clock, Users, ChefHat, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/generer")({
  head: () => ({ meta: [{ title: "Générer une recette — MiamPlan" }] }),
  component: Generer,
});

function Generer() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [appliance, setAppliance] = useState("cookeo");
  const [recipe, setRecipe] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const genAuth = useServerFn(generateRecipe);
  const genPub = useServerFn(generateRecipePublic);
  const save = useServerFn(saveRecipe);

  async function go() {
    if (prompt.length < 3) return toast.error("Décris un peu ton envie 🙂");
    setLoading(true);
    setRecipe(null);
    try {
      const r = user
        ? await genAuth({ data: { prompt, appliance } })
        : await genPub({ data: { prompt, appliance } });
      setRecipe(r);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur de génération");
    } finally {
      setLoading(false);
    }
  }

  async function onSave() {
    if (!user) return toast.error("Connectez-vous pour sauvegarder");
    try {
      await save({ data: { ...recipe, source: "ai" } });
      toast.success("Recette sauvegardée !");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="w-7 h-7 text-primary"/>Générer une recette</h1>
        <p className="text-muted-foreground mt-1">Dis-moi ce qui te ferait plaisir, je te concocte une recette cohérente et savoureuse.</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div>
          <Label>Ton envie ou tes ingrédients</Label>
          <Textarea rows={3} placeholder="Ex : un plat oriental réconfortant avec du poulet et des pois chiches" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div>
          <Label>Appareil de cuisson</Label>
          <Select value={appliance} onValueChange={setAppliance}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              {APPLIANCES.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={go} disabled={loading} className="w-full">
          {loading ? "Le chef réfléchit..." : "Générer ✨"}
        </Button>
      </div>

      {recipe && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-start gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span className="bg-secondary/50 px-2 py-0.5 rounded-full">{recipe.cuisine_style}</span>
                <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3"/>{recipe.prep_time} min</span>
                <span className="inline-flex items-center gap-1"><Users className="w-3 h-3"/>{recipe.servings} pers.</span>
              </div>
              <h2 className="text-2xl font-bold">{recipe.title}</h2>
              <p className="text-muted-foreground text-sm mt-1">{recipe.description}</p>
            </div>
            <Button onClick={onSave} variant="outline" size="sm" disabled={!user}><Save className="w-4 h-4"/>{user ? "Sauvegarder" : "Connectez-vous"}</Button>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-background border border-border rounded-xl p-4">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-1"><ChefHat className="w-4 h-4"/>Ingrédients</h3>
              <ul className="space-y-1 text-sm">
                {recipe.ingredients.map((ing: any, i: number) => (
                  <li key={i} className="flex justify-between"><span>{ing.name}</span><span className="text-muted-foreground">{ing.qty}</span></li>
                ))}
              </ul>
            </div>
            <div className="md:col-span-2 space-y-2">
              <h3 className="font-bold text-sm">Étapes</h3>
              {recipe.steps.map((s: any, i: number) => (
                <div key={i} className="bg-background border border-border rounded-xl p-3 flex gap-3">
                  <div className="shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground font-bold flex items-center justify-center text-xs">{i + 1}</div>
                  <div className="text-sm flex-1">
                    <p>{s.text}</p>
                    <div className="flex gap-2 mt-1 text-xs">
                      {s.timer_minutes ? <span className="bg-accent/40 px-2 py-0.5 rounded-full">{s.timer_minutes} min</span> : null}
                      {s.appliance_settings && <span className="bg-secondary/40 px-2 py-0.5 rounded-full">{s.appliance_settings}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}