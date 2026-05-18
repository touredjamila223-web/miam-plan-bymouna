import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, Play, Pause, RotateCcw, Check, Layers } from "lucide-react";

export const Route = createFileRoute("/batch/cuisine")({
  head: () => ({ meta: [{ title: "Mode cuisine batch — MiamPlan" }] }),
  component: BatchCookingMode,
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

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function BatchCookingMode() {
  const nav = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const tickRef = useRef<number | null>(null);
  const wakeRef = useRef<any>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("batch_session");
      if (raw) setSession(JSON.parse(raw));
    } catch {}
  }, []);

  const steps = (session?.parallel_steps as any[]) ?? [];
  const step = steps[stepIdx];
  const total = steps.length;

  useEffect(() => {
    (async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeRef.current = await (navigator as any).wakeLock.request("screen");
        }
      } catch {}
    })();
    return () => { try { wakeRef.current?.release?.(); } catch {} };
  }, []);

  useEffect(() => {
    setRunning(false);
    setSecondsLeft((step?.duration_minutes ?? 0) * 60);
  }, [stepIdx, step?.duration_minutes]);

  useEffect(() => {
    if (!running) return;
    tickRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { setRunning(false); beep(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [running]);

  if (!session) {
    return (
      <div className="text-center py-16 space-y-3">
        <Layers className="w-10 h-10 mx-auto text-muted-foreground" />
        <p className="text-muted-foreground">Aucune session batch active.</p>
        <button onClick={() => nav({ to: "/batch" })} className="bg-primary text-primary-foreground px-4 py-2 rounded-full">Retour</button>
      </div>
    );
  }

  if (!step) return null;

  function toggle(key: string) {
    setChecked((c) => ({ ...c, [key]: !c[key] }));
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border">
        <button onClick={() => nav({ to: "/batch" })} className="p-2 hover:bg-secondary rounded-full"><X className="w-5 h-5" /></button>
        <div className="text-sm text-muted-foreground">Bloc {stepIdx + 1} / {total}</div>
        <div className="w-9" />
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <div className="text-xs text-primary uppercase font-semibold">{step.time_block}</div>
          <h2 className="text-2xl font-bold mt-1">{step.duration_minutes} min en parallèle</h2>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-4">
          <div className="text-5xl font-mono font-bold tabular-nums">{fmt(secondsLeft)}</div>
          <div className="flex justify-center gap-3">
            <button onClick={() => setRunning((r) => !r)} className="bg-primary text-primary-foreground px-5 py-2.5 rounded-full inline-flex items-center gap-2">
              {running ? <><Pause className="w-4 h-4" />Pause</> : <><Play className="w-4 h-4" />Démarrer</>}
            </button>
            <button onClick={() => { setRunning(false); setSecondsLeft((step.duration_minutes ?? 0) * 60); }} className="bg-secondary text-secondary-foreground px-5 py-2.5 rounded-full inline-flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />Reset
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Tâches à mener en parallèle</div>
          {step.tasks.map((t: string, j: number) => {
            const key = `${stepIdx}-${j}`;
            const done = !!checked[key];
            return (
              <button key={key} onClick={() => toggle(key)} className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border ${done ? "bg-primary/5 border-primary/30" : "bg-card border-border"}`}>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"}`}>
                  {done && <Check className="w-3.5 h-3.5" />}
                </div>
                <span className={`text-sm ${done ? "line-through text-muted-foreground" : ""}`}>{t}</span>
              </button>
            );
          })}
        </div>

        {session.meals?.length ? (
          <div className="bg-secondary/40 rounded-xl p-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Cette session prépare</div>
            <ul className="text-sm space-y-1">
              {session.meals.map((m: any) => (
                <li key={m.recipe_id + m.date}>• {m.day} {m.slot} — {m.title}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <footer className="flex items-center justify-between p-4 border-t border-border">
        <button onClick={() => setStepIdx((i) => Math.max(0, i - 1))} disabled={stepIdx === 0} className="p-3 rounded-full bg-secondary disabled:opacity-40">
          <ChevronLeft className="w-5 h-5" />
        </button>
        {stepIdx < total - 1 ? (
          <button onClick={() => setStepIdx((i) => i + 1)} className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-medium inline-flex items-center gap-2">
            Bloc suivant<ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={() => nav({ to: "/batch" })} className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-medium inline-flex items-center gap-2">
            <Check className="w-4 h-4" />Terminer la session
          </button>
        )}
        <div className="w-11" />
      </footer>
    </div>
  );
}
