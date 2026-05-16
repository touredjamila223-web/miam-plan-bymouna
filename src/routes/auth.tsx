import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ChefHat } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Connexion — MiamPlan" }] }),
  component: Auth,
});

function Auth() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Compte créé ! Vérifiez votre boîte mail.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav({ to: "/" });
      }
    } catch (e: any) {
      toast.error(e.message ?? "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  }

  async function google() {
    try {
      await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    } catch (e: any) {
      toast.error(e.message ?? "Connexion Google impossible");
    }
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="text-center mb-8">
        <div className="inline-flex p-3 bg-primary/10 rounded-2xl mb-3"><ChefHat className="w-8 h-8 text-primary"/></div>
        <h1 className="text-3xl font-bold">{mode === "login" ? "Bon retour !" : "Bienvenue dans MiamPlan"}</h1>
        <p className="text-muted-foreground mt-2">Sauvegardez vos recettes et synchronisez vos appareils.</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
        <Button onClick={google} variant="outline" className="w-full">Continuer avec Google</Button>
        <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t"/></div><div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">ou</span></div></div>

        <form onSubmit={submit} className="space-y-3">
          <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label htmlFor="pw">Mot de passe</Label><Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button type="submit" disabled={loading} className="w-full">{loading ? "..." : mode === "login" ? "Se connecter" : "Créer mon compte"}</Button>
        </form>

        <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-sm text-muted-foreground hover:text-primary w-full text-center">
          {mode === "login" ? "Pas encore de compte ? S'inscrire" : "Déjà inscrit ? Se connecter"}
        </button>
      </div>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Ou <Link to="/" className="text-primary underline">continuer en invité</Link>
      </p>
    </div>
  );
}