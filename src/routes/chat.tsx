import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import ReactMarkdown from "react-markdown";
import { Sparkles, Send, BookmarkPlus, ChefHat, RotateCcw, Clock, Flame, Loader2 } from "lucide-react";
import { saveRecipe } from "@/lib/recipes.functions";
import { APPLIANCES } from "@/lib/constants";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Leia, votre chef IA — MiamPlan" }] }),
  component: Chat;
});

function applianceLabel(id?: string) {
  return APPLIANCES.find((a) => a.id === id)?.label ?? id ?? "";
}

function RecipeProposalCard({
  recipe,
  appliance,
  onAnother,
}: {
  recipe: any;
  appliance?: string;
  onAnother: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(saveRecipe);
  const [busy, setBusy] = useState<"save" | "cook" | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  async function persist(): Promise<string> {
    if (savedId) return savedId;
    const { ingredients, steps, ...rest } = recipe;
    const row: any = await save({
      data: {
        title: rest.title,
        description: rest.description,
        cuisine_style: rest.cuisine_style,
        difficulty: rest.difficulty,
        prep_time: rest.prep_time,
        servings: rest.servings,
        appliance: rest.appliance ?? appliance ?? "cookeo",
        protein: rest.protein,
        vegetables: rest.vegetables ?? [],
        calories: rest.calories,
        ingredients,
        steps,
        source: "ai",
      } as any,
    });
    setSavedId(row.id);
    qc.invalidateQueries({ queryKey: ["recipes"] });
    qc.invalidateQueries({ queryKey: ["user-stats"] });
    return row.id;
  }

  async function onSave() {
    if (busy || savedId) return;
    setBusy("save");
    try {
      await persist();
      toast.success("Recette ajoutée à ta bibliothèque");
    } catch (e: any) {
      toast.error(e.message ?? "Erreur de sauvegarde");
    } finally {
      setBusy(null);
    }
  }

  async function onCook() {
    if (busy) return;
    setBusy("cook");
    try {
      const id = await persist();
      navigate({ to: "/recettes/cuisine/$id", params: { id } });
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="text-3xl">🍽️</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base leading-tight">{recipe.title}</h3>
          {recipe.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{recipe.description}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {recipe.appliance && (
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
            {applianceLabel(recipe.appliance)}
          </span>
        )}
        {recipe.cuisine_style && (
          <span className="bg-secondary/60 px-2 py-0.5 rounded-full capitalize">{recipe.cuisine_style}</span>
        )}
        {recipe.protein && (
          <span className="bg-accent/50 px-2 py-0.5 rounded-full capitalize">{recipe.protein}</span>
        )}
        {recipe.prep_time != null && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted">
            <Clock className="w-3 h-3" />
            {recipe.prep_time} min
          </span>
        )}
        {recipe.calories != null && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted">
            <Flame className="w-3 h-3" />
            {recipe.calories} kcal
          </span>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Voir ingrédients & étapes
        </summary>
        <div className="mt-3 grid sm:grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-1">Ingrédients</h4>
            <ul className="text-sm space-y-0.5">
              {(recipe.ingredients ?? []).map((i: any, idx: number) => (
                <li key={idx}>
                  • {i.qty} {i.name}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-xs uppercase text-muted-foreground mb-1">Étapes</h4>
            <ol className="text-sm space-y-1.5 list-decimal list-inside">
              {(recipe.steps ?? []).map((s: any, idx: number) => (
                <li key={idx}>
                  {s.text}
                  {s.appliance_settings && (
                    <span className="block text-xs text-primary ml-4">⚙ {s.appliance_settings}</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onClick={onSave} disabled={busy !== null || !!savedId}>
          {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
          {savedId ? "Sauvegardée" : "Sauvegarder"}
        </Button>
        <Button size="sm" variant="default" onClick={onCook} disabled={busy !== null}>
          {busy === "cook" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChefHat className="w-4 h-4" />}
          Mode cuisine
        </Button>
        <Button size="sm" variant="outline" onClick={onAnother} disabled={busy !== null}>
          <RotateCcw className="w-4 h-4" />
          Une autre
        </Button>
      </div>
    </div>
  );
}

function Chat() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    api: "/api/chat",
    body: { userId: user?.id ?? null },
  } as any);

  function askAnother() {
    sendMessage({ text: "Propose-moi une autre recette, différente (autre style culinaire, autre protéine ou autre technique)." });
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-180px)]">
      <h1 className="text-2xl font-bold mb-3 flex items-center gap-2">
        <Sparkles className="w-6 h-6 text-primary" />
        Leia, votre chef IA
      </h1>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {messages.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground space-y-2">
            <p>Bonjour, je suis Leia 👩‍🍳</p>
            <p className="text-sm">
              Demandez-moi une recette ("un poulet curry coco pour ce soir"), un menu de semaine ou une idée
              vide-frigo. Je vous prépare une proposition que vous pouvez sauvegarder ou cuisiner direct.
            </p>
          </div>
        )}
        {messages.map((m: any) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "bg-primary/10 ml-12 rounded-2xl p-4"
                : "mr-12 space-y-2"
            }
          >
            {m.role === "user" && <div className="text-xs text-muted-foreground mb-1">Vous</div>}
            {m.role !== "user" && (
              <div className="text-xs text-muted-foreground">Leia</div>
            )}
            {(m.parts ?? [{ type: "text", text: m.content }]).map((p: any, i: number) => {
              if (p.type === "text") {
                if (!p.text?.trim()) return null;
                return (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "prose prose-sm max-w-none"
                        : "prose prose-sm max-w-none bg-card border border-border rounded-2xl p-4"
                    }
                  >
                    <ReactMarkdown>{p.text}</ReactMarkdown>
                  </div>
                );
              }
              if (p.type === "tool-proposeRecipe") {
                if (p.state === "output-available") {
                  return (
                    <RecipeProposalCard
                      key={i}
                      recipe={p.output}
                      appliance={p.input?.appliance}
                      onAnother={askAnother}
                    />
                  );
                }
                if (p.state === "output-error") {
                  return (
                    <div key={i} className="bg-destructive/10 text-destructive rounded-2xl p-4 text-sm">
                      Impossible de générer la recette. Réessaie.
                    </div>
                  );
                }
                return (
                  <div key={i} className="bg-card border border-border rounded-2xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      Leia mijote ta recette
                      {p.input?.appliance && ` au ${applianceLabel(p.input.appliance)}`}…
                    </div>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        {(status === "submitted" || status === "streaming") &&
          messages[messages.length - 1]?.role === "user" && (
            <div className="mr-12 bg-card border border-border rounded-2xl p-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              Leia réfléchit…
            </div>
          )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput("");
          }
        }}
        className="flex gap-2 mt-3"
      >
        <Input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Demande une recette, une idée, un conseil..."
        />
        <Button type="submit" disabled={status === "streaming" || status === "submitted"}>
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
