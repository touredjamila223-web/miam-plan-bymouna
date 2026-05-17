import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveOnboarding, getFamilyContext } from "@/lib/family.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { APPLIANCES, DIETARY_RESTRICTIONS } from "@/lib/constants";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { LogOut, User } from "lucide-react";

export const Route = createFileRoute("/profil")({
  head: () => ({ meta: [{ title: "Profil — MiamPlan" }] }),
  component: Profil,
});

function Profil() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const getCtx = useServerFn(getFamilyContext);
  const save = useServerFn(saveOnboarding);

  const [familyName, setFamilyName] = useState("");
  const [size, setSize] = useState(4);
  const [apps, setApps] = useState<string[]>([]);
  const [restr, setRestr] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: ctx } = useQuery({ queryKey: ["family-ctx"], queryFn: () => getCtx(), enabled: !!user });

  const hydrated = useRef(false);
  useEffect(() => {
    if (ctx && !hydrated.current) {
      hydrated.current = true;
      setFamilyName(ctx.profile?.family_name ?? "");
      setSize(ctx.profile?.household_size ?? 4);
      setApps(ctx.appliances ?? []);
      setRestr(ctx.restrictions ?? []);
    }
  }, [ctx]);

  function toggle(arr: string[], setArr: (a: string[]) => void, v: string) {
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  async function submit() {
    setSaving(true);
    try {
      await save({ data: { family_name: familyName || "Famille", household_size: size, appliances: apps, restrictions: restr } });
      toast.success("Profil enregistré !");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function logout() {
    await supabase.auth.signOut();
    nav({ to: "/" });
  }

  if (loading) return <p className="py-12 text-center">Chargement...</p>;
  if (!user) return (
    <div className="py-16 text-center max-w-md mx-auto">
      <User className="w-12 h-12 text-primary/40 mx-auto mb-3"/>
      <h1 className="text-2xl font-bold mb-2">Connectez-vous</h1>
      <p className="text-muted-foreground mb-4">Pour personnaliser votre profil et sauvegarder vos données.</p>
      <Link to="/auth" className="text-primary underline">Aller à la connexion</Link>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Profil famille</h1>
        <Button variant="outline" size="sm" onClick={logout}><LogOut className="w-4 h-4"/>Déconnexion</Button>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div><Label>Nom de la famille</Label><Input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="Famille Dupont"/></div>
        <div><Label>Nombre de personnes</Label><Input type="number" min={1} max={20} value={size} onChange={(e) => setSize(parseInt(e.target.value || "4"))}/></div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-bold mb-3">Vos appareils</h2>
        <div className="grid grid-cols-2 gap-2">
          {APPLIANCES.map((a) => (
            <label key={a.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/20 cursor-pointer">
              <Checkbox checked={apps.includes(a.id)} onCheckedChange={() => toggle(apps, setApps, a.id)} />
              <span className="text-sm">{a.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-bold mb-3">Préférences alimentaires</h2>
        <div className="grid grid-cols-2 gap-2">
          {DIETARY_RESTRICTIONS.map((r) => (
            <label key={r.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/20 cursor-pointer">
              <Checkbox checked={restr.includes(r.id)} onCheckedChange={() => toggle(restr, setRestr, r.id)} />
              <span className="text-sm">{r.label}</span>
            </label>
          ))}
        </div>
      </div>

      <Button onClick={submit} disabled={saving} className="w-full">{saving ? "..." : "Enregistrer"}</Button>
    </div>
  );
}