import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateRecipeBatch, saveRecipes, importRecipeFromUrl, importRecipeFromImage } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { APPLIANCES } from "@/lib/constants";
import { Sparkles, Clock, Users, Flame, Carrot, Drumstick, RefreshCw, Save, ChevronDown, ChevronUp, Link2, Camera } from "lucide-react";
import { toast } from "sonner";
import { StrictDietBanner } from "@/components/strict-diet-banner";

export const Route = createFileRoute("/generer")({
  head: () => ({ meta: [{ title: "Générer des recettes — MiamPlan" }] }),
  component: Generer,
});

function Generer() {
  const { user } = useAuth();
  const [appliance, setAppliance] = useState("cookeo");
  const [hint, setHint] = useState("");
  const [recipes, setRecipes] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);

  const genBatch = useServerFn(generateRecipeBatch);
  const save = useServerFn(saveRecipes);
  const importUrl = useServerFn(importRecipeFromUrl);
  const importImg = useServerFn(importRecipeFromImage);
  const [importMode, setImportMode] = useState<"url" | "photo" | null>(null);
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);

  async function onImportUrl() {
    if (!user) return toast.error("Connecte-toi pour importer");
    if (!url.trim()) return toast.error("Colle un lien de recette");
    setImporting(true);
    try {
      const r = await importUrl({ data: { url: url.trim(), appliance } });
      setRecipes([r]);
      setSelected({ 0: true });
      setExpanded({ 0: true });
      toast.success("Recette importée — vérifie et sauvegarde");
    } catch (e: any) {
      toast.error(e.message ?? "Import impossible");
    } finally {
      setImporting(false);
    }
  }

  async function onImportPhoto(file: File) {
    if (!user) return toast.error("Connecte-toi pour importer");
    if (file.size > 6 * 1024 * 1024) return toast.error("Photo trop lourde (max 6 Mo)");
    setImporting(true);
    try {
      const dataUrl: string = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result as string);
        fr.onerror = () => rej(new Error("Lecture impossible"));
        fr.readAsDataURL(file);
      });
      const r = await importImg({ data: { image_data_url: dataUrl, appliance } });
      setRecipes([r]);
      setSelected({ 0: true });
      setExpanded({ 0: true });
      toast.success("Recette extraite — vérifie et sauvegarde");
    } catch (e: any) {
      toast.error(e.message ?? "Lecture impossible");
    } finally {
      setImporting(false);
    }
  }

  async function go() {
    setLoading(true);
    setRecipes([]);
    setSelected({});
    setExpanded({});
    try {
      const list = await genBatch({ data: { appliance, hint: hint || undefined } });
      setRecipes(list);
    } catch (e: any) {
      toast.error(e.message ?? "Erreur de génération");
    } finally {
      setLoading(false);
    }
  }

  async function onSaveSelected() {
    if (!user) return toast.error("Connecte-toi pour sauvegarder");
    const picks = recipes.filter((_, i) => selected[i]);
    if (!picks.length) return toast.error("Sélectionne au moins une recette");
    try {
      await save({ data: { recipes: picks.map((r) => ({ ...r, source: "ai" })) } });
      toast.success(`${picks.length} recette(s) ajoutée(s) à ta bibliothèque !`);
      setRecipes([]);
      setSelected({});
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Sparkles className="w-7 h-7 text-primary"/>Générer des recettes</h1>
        <p className="text-muted-foreground mt-1">Choisis ton appareil, l'IA te propose 3 recettes variées et cohérentes adaptées à tes préférences.</p>
      </div>
      <StrictDietBanner />

      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Appareil de cuisson</Label>
            <Select value={appliance} onValueChange={setAppliance}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                {APPLIANCES.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Une envie en particulier ? (optionnel)</Label>
            <Input placeholder="Ex : envie d'oriental, plutôt léger…" value={hint} onChange={(e) => setHint(e.target.value)} />
          </div>
        </div>
        <Button onClick={go} disabled={loading} className="w-full">
          <Sparkles className="w-4 h-4"/>
          {loading ? "Le chef réfléchit…" : recipes.length ? "Régénérer 3 nouvelles recettes" : "Générer 3 recettes ✨"}
        </Button>

        <div className="border-t border-border pt-4">
          <p className="text-xs uppercase text-muted-foreground tracking-wider mb-2">Ou importe une recette existante</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportMode((m) => (m === "url" ? null : "url"))}>
              <Link2 className="w-4 h-4"/>Depuis un lien
            </Button>
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer">
                <Camera className="w-4 h-4"/>Depuis une photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImportPhoto(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
          </div>
          {importMode === "url" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Input
                placeholder="https://www.marmiton.org/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 min-w-[220px]"
              />
              <Button onClick={onImportUrl} disabled={importing}>
                {importing ? "Lecture…" : "Importer"}
              </Button>
            </div>
          )}
          {importing && importMode !== "url" && (
            <p className="text-xs text-muted-foreground mt-2">L'IA lit la photo, ça peut prendre 10–20 s…</p>
          )}
        </div>
      </div>

      {recipes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">Coche celles qui te plaisent pour les ajouter à ta bibliothèque, ou relance pour de nouvelles propositions.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={go} disabled={loading}><RefreshCw className="w-4 h-4"/>Tout écarter</Button>
              <Button size="sm" onClick={onSaveSelected} disabled={!user || !Object.values(selected).some(Boolean)}>
                <Save className="w-4 h-4"/>{user ? "Sauvegarder la sélection" : "Connecte-toi pour sauvegarder"}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recipes.map((r, i) => {
              const isSel = !!selected[i];
              return (
                <label
                  key={i}
                  className={`bg-card border rounded-2xl p-5 cursor-pointer transition block ${isSel ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"}`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox checked={isSel} onCheckedChange={(v) => setSelected((s) => ({ ...s, [i]: !!v }))} className="mt-1"/>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                        <span className="bg-secondary/60 px-2 py-0.5 rounded-full">{r.cuisine_style}</span>
                        <span className="bg-accent/40 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Drumstick className="w-3 h-3"/>{r.protein}</span>
                        <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3"/>{r.prep_time} min</span>
                        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3"/>{r.servings}</span>
                        <span className="inline-flex items-center gap-1"><Flame className="w-3 h-3"/>{r.calories} kcal</span>
                      </div>
                      <h3 className="font-bold text-lg leading-tight">{r.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                      {r.vegetables?.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1"><Carrot className="w-3 h-3"/>{r.vegetables.join(", ")}</p>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setExpanded((s) => ({ ...s, [i]: !s[i] })); }}
                        className="mt-2 text-xs text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        {expanded[i] ? <><ChevronUp className="w-3 h-3"/>Masquer le détail</> : <><ChevronDown className="w-3 h-3"/>Voir le détail</>}
                      </button>
                      {expanded[i] && (
                        <div className="mt-2 pt-2 border-t border-border space-y-2 text-xs">
                          <div>
                            <p className="font-semibold mb-1">Ingrédients</p>
                            <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                              {r.ingredients?.map((ing: any, k: number) => (
                                <li key={k}>{ing.qty ? `${ing.qty} ` : ""}{ing.name}</li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <p className="font-semibold mb-1">Étapes</p>
                            <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                              {r.steps?.map((s: any, k: number) => (
                                <li key={k}>{s.text}{s.timer_minutes ? ` (${s.timer_minutes} min)` : ""}</li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}