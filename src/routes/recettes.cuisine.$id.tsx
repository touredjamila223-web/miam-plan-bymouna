import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getRecipe } from "@/lib/recipes.functions";
import { recordCooked } from "@/lib/cooking.functions";
import { useAuth } from "@/hooks/use-auth";
import { ChevronLeft, ChevronRight, X, Play, Pause, RotateCcw, Star, Heart, Check, Volume2, VolumeX } from "lucide-react";

export const Route = createFileRoute("/recettes/cuisine/$id")({
  head: () => ({ meta: [{ title: "Mode cuisine — MiamPlan" }] }),
  component: CookingMode,
});

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880;
    o.start();
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    o.stop(ctx.currentTime + 1.2);
  } catch {}
}

function CookingMode() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const get = useServerFn(getRecipe);
  const record = useServerFn(recordCooked);
  const { data: r, isLoading } = useQuery({ queryKey: ["recipe", id], queryFn: () => get({ data: { id } }) });

  const [stepIdx, setStepIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const tickRef = useRef<number | null>(null);
  const wakeRef = useRef<any>(null);
  const [showRating, setShowRating] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const steps = ((r?.steps as any[]) ?? []);
  const step = steps[stepIdx];
  const total = steps.length;

  // Wake lock
  useEffect(() => {
    (async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch {}
    })();
    const onVis = async () => {
      if (document.visibilityState === "visible" && !wakeRef.current?.released) {
        try { wakeRef.current = await (navigator as any).wakeLock?.request("screen"); } catch {}
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      try { wakeRef.current?.release?.(); } catch {}
      try { window.speechSynthesis?.cancel(); } catch {}
    };
  }, []);

  // Reset timer on step change
  useEffect(() => {
    setRunning(false);
    setSecondsLeft((step?.timer_minutes ?? 0) * 60);
  }, [stepIdx, step?.timer_minutes]);

  // Voice reading
  const speakText = (text: string) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      u.rate = 0.95;
      u.pitch = 1;
      const voices = synth.getVoices();
      const fr = voices.find((v) => v.lang?.startsWith("fr"));
      if (fr) u.voice = fr;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      synth.speak(u);
    } catch {}
  };

  useEffect(() => {
    if (!voiceOn || !step?.text) return;
    const parts = [step.text];
    if (step.appliance_settings) parts.push(`Réglages : ${step.appliance_settings}`);
    if (step.timer_minutes) parts.push(`Minuteur : ${step.timer_minutes} minutes.`);
    speakText(parts.join(". "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, voiceOn]);

  useEffect(() => {
    if (!running) return;
    tickRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          beep();
          toast.success("Minuteur terminé !");
          return 0;
        }
        return s - 1;
      });
    }, 1000) as unknown as number;
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [running]);

  const recordMut = useMutation({
    mutationFn: (v: { taste: number; ease: number; loved: boolean; comment: string }) =>
      record({ data: { recipe_id: id, taste_rating: v.taste, ease_rating: v.ease, family_loved: v.loved, comment: v.comment || undefined } }),
    onSuccess: () => { toast.success("Merci, c'est noté !"); nav({ to: "/recettes/$id", params: { id } }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-center py-20">Chargement...</p>;
  if (!r || !steps.length) return <p className="text-center py-20">Recette introuvable.</p>;

  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const ss = (secondsLeft % 60).toString().padStart(2, "0");
  const isLast = stepIdx === total - 1;

  return (
    <div className="fixed inset-0 bg-background z-[60] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Link to="/recettes/$id" params={{ id }} className="p-2 rounded-lg hover:bg-accent/30"><X className="w-5 h-5" /></Link>
        <div className="text-sm text-muted-foreground">Étape {stepIdx + 1} / {total}</div>
        <button
          onClick={() => {
            const next = !voiceOn;
            setVoiceOn(next);
            if (!next) { try { window.speechSynthesis?.cancel(); } catch {} setSpeaking(false); }
            else if (step?.text) speakText(step.text);
          }}
          className={`p-2 rounded-lg hover:bg-accent/30 ${voiceOn ? "text-primary" : "text-muted-foreground"}`}
          aria-label={voiceOn ? "Couper la lecture vocale" : "Activer la lecture vocale"}
          title={voiceOn ? "Lecture vocale ON" : "Lecture vocale OFF"}
        >
          {voiceOn ? <Volume2 className={`w-5 h-5 ${speaking ? "animate-pulse" : ""}`} /> : <VolumeX className="w-5 h-5" />}
        </button>
      </div>

      {/* Progress */}
      <div className="h-1 bg-border">
        <div className="h-1 bg-primary transition-all" style={{ width: `${((stepIdx + 1) / total) * 100}%` }} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-8 max-w-2xl mx-auto w-full">
        <h1 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">{r.title}</h1>
        <p className="text-2xl md:text-3xl leading-relaxed font-medium mb-6" style={{ fontFamily: "Fraunces, serif" }}>
          {step.text}
        </p>

        {step.appliance_settings && (
          <div className="bg-accent/30 border border-accent rounded-2xl p-4 mb-6">
            <div className="text-xs uppercase text-muted-foreground mb-1">Réglages appareil</div>
            <div className="text-lg font-semibold">{step.appliance_settings}</div>
          </div>
        )}

        {step.timer_minutes ? (
          <div className="bg-card border border-border rounded-3xl p-6 text-center">
            <div className="text-6xl md:text-7xl font-bold tabular-nums" style={{ fontFamily: "Fraunces, serif" }}>{mm}:{ss}</div>
            <div className="flex justify-center gap-3 mt-4">
              <button onClick={() => setRunning((r) => !r)} className="bg-primary text-primary-foreground rounded-full px-6 py-3 flex items-center gap-2 font-medium">
                {running ? <><Pause className="w-4 h-4" />Pause</> : <><Play className="w-4 h-4" />Démarrer</>}
              </button>
              <button onClick={() => { setRunning(false); setSecondsLeft((step.timer_minutes ?? 0) * 60); }} className="border border-border rounded-full px-4 py-3"><RotateCcw className="w-4 h-4" /></button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom nav */}
      <div className="border-t border-border px-4 py-3 flex items-center justify-between gap-3">
        <button disabled={stepIdx === 0} onClick={() => setStepIdx((i) => Math.max(0, i - 1))} className="px-5 py-3 rounded-full border border-border flex items-center gap-2 disabled:opacity-30">
          <ChevronLeft className="w-5 h-5" />Précédent
        </button>
        {isLast ? (
          <button onClick={() => (user ? setShowRating(true) : nav({ to: "/recettes/$id", params: { id } }))} className="px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium flex items-center gap-2">
            <Check className="w-5 h-5" />C'est prêt !
          </button>
        ) : (
          <button onClick={() => setStepIdx((i) => Math.min(total - 1, i + 1))} className="px-6 py-3 rounded-full bg-primary text-primary-foreground font-medium flex items-center gap-2">
            Suivant<ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {showRating && <RatingModal onClose={() => setShowRating(false)} onSubmit={(v) => recordMut.mutate(v)} pending={recordMut.isPending} />}
    </div>
  );
}

function RatingModal({ onClose, onSubmit, pending }: { onClose: () => void; onSubmit: (v: { taste: number; ease: number; loved: boolean; comment: string }) => void; pending: boolean }) {
  const [taste, setTaste] = useState(4);
  const [ease, setEase] = useState(4);
  const [loved, setLoved] = useState(false);
  const [comment, setComment] = useState("");

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-end md:items-center justify-center p-4">
      <div className="bg-card rounded-3xl max-w-md w-full p-6 space-y-5">
        <div>
          <h3 className="text-xl font-bold" style={{ fontFamily: "Fraunces, serif" }}>Comment c'était ?</h3>
          <p className="text-sm text-muted-foreground">Votre avis aide l'IA à mieux vous proposer.</p>
        </div>

        <Stars label="Goût" value={taste} onChange={setTaste} />
        <Stars label="Facilité" value={ease} onChange={setEase} />

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={loved} onChange={(e) => setLoved(e.target.checked)} className="w-5 h-5 accent-primary" />
          <span className="flex items-center gap-2"><Heart className={`w-4 h-4 ${loved ? "fill-primary text-primary" : ""}`} />La famille a adoré</span>
        </label>

        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Un mot (optionnel)" rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-full border border-border">Plus tard</button>
          <button onClick={() => onSubmit({ taste, ease, loved, comment })} disabled={pending} className="px-5 py-2 rounded-full bg-primary text-primary-foreground font-medium disabled:opacity-50">
            {pending ? "..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="text-sm font-medium mb-1">{label}</div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n)} type="button" className="p-1">
            <Star className={`w-7 h-7 ${n <= value ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
