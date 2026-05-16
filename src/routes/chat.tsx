import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ReactMarkdown from "react-markdown";
import { Sparkles, Send } from "lucide-react";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Chat IA — MiamPlan" }] }),
  component: Chat,
});

function Chat() {
  const { user } = useAuth();
  const { messages, sendMessage, status, input, setInput } = useChat({
    api: "/api/chat",
    body: { userId: user?.id ?? null },
  } as any);

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-180px)]">
      <h1 className="text-2xl font-bold mb-3 flex items-center gap-2"><Sparkles className="w-6 h-6 text-primary"/>Chat avec MiamPlan</h1>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {messages.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground">
            Posez-moi une question : "Que cuisiner avec du poulet et des courgettes ?", "Idée de batch cooking pour la semaine ?"
          </div>
        )}
        {messages.map((m: any) => (
          <div key={m.id} className={`rounded-2xl p-4 ${m.role === "user" ? "bg-primary/10 ml-12" : "bg-card border border-border mr-12"}`}>
            <div className="text-xs text-muted-foreground mb-1">{m.role === "user" ? "Vous" : "MiamPlan"}</div>
            <div className="prose prose-sm max-w-none">
              {(m.parts ?? [{ type: "text", text: m.content }]).map((p: any, i: number) =>
                p.type === "text" ? <ReactMarkdown key={i}>{p.text}</ReactMarkdown> : null,
              )}
            </div>
          </div>
        ))}
        {status === "streaming" && <div className="text-sm text-muted-foreground">Le chef écrit...</div>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) { sendMessage({ text: input }); setInput(""); } }} className="flex gap-2 mt-3">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Posez votre question..." />
        <Button type="submit" disabled={status === "streaming"}><Send className="w-4 h-4"/></Button>
      </form>
    </div>
  );
}