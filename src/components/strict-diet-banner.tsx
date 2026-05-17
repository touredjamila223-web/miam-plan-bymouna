import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useUserStats, restrictionLabels } from "@/hooks/use-user-stats";

export function StrictDietBanner() {
  const { data } = useUserStats();
  const restrictions = data?.restrictions ?? [];
  if (!data) return null;

  if (!restrictions.length) {
    return (
      <div className="flex items-start gap-2 bg-muted/40 border border-border rounded-xl px-3 py-2 text-xs">
        <ShieldAlert className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p className="text-muted-foreground">
          Aucune préférence alimentaire renseignée. <Link to="/profil" className="text-primary underline">Définis tes restrictions</Link> pour activer le mode strict.
        </p>
      </div>
    );
  }

  const labels = restrictionLabels(restrictions);
  return (
    <div className="flex items-start gap-2 bg-primary/5 border border-primary/30 rounded-xl px-3 py-2 text-xs">
      <ShieldCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-medium text-foreground">Mode strict activé — les recettes proposées respectent tes restrictions :</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {labels.map((l) => (
            <span key={l} className="bg-primary/15 text-primary px-2 py-0.5 rounded-full">{l}</span>
          ))}
        </div>
        <p className="text-muted-foreground mt-1">Toute recette contenant un ingrédient interdit est automatiquement écartée avant affichage.</p>
      </div>
    </div>
  );
}