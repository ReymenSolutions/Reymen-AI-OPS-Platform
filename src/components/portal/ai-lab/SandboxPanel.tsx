"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Send, Trash2, MessageSquare, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatDate } from "@/lib/utils";
import {
  createSandboxSession, deleteSandboxSession, getSandboxSession, sendSandboxMessage,
} from "@/actions/ai-lab";
import type { AiSandboxMessage, AiSandboxSession } from "@prisma/client";
import type { PromptWithVersions } from "./AiLabWorkspace";
import { versionOptions } from "./version-options";
import { usePreferences } from "@/context/preferences";

type SandboxSessionListItem = AiSandboxSession & { _count: { messages: number } };

interface SandboxPanelProps {
  prompts: PromptWithVersions[];
  initialSessions: SandboxSessionListItem[];
}

export function SandboxPanel({ prompts, initialSessions }: SandboxPanelProps) {
  const { lang } = usePreferences();
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedId, setSelectedId] = useState<string | null>(initialSessions[0]?.id ?? null);
  const [messages, setMessages] = useState<AiSandboxMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const [sending, startSending] = useTransition();
  const [creating, startCreating] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVersionId, setNewVersionId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  const options = versionOptions(prompts);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    setLoadingMessages(true);
    getSandboxSession(selectedId)
      .then((s) => setMessages(s.messages))
      .catch((e) => toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al cargar la sesión" : "Error loading the session")))
      .finally(() => setLoadingMessages(false));
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function handleCreateSession() {
    startCreating(async () => {
      try {
        const result = await createSandboxSession({
          name: newName.trim() || undefined,
          promptVersionId: newVersionId,
        });
        const created: SandboxSessionListItem = {
          id: result.sessionId,
          organizationId: "",
          name: newName.trim() || (lang === "es" ? "Sesión de prueba" : "Test session"),
          promptVersionId: newVersionId ?? null,
          createdBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { messages: 0 },
        };
        setSessions((prev) => [created, ...prev]);
        setSelectedId(created.id);
        setCreateOpen(false);
        setNewName("");
        setNewVersionId(undefined);
        toast.success(lang === "es" ? "Sesión creada" : "Session created");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al crear la sesión" : "Error creating the session"));
      }
    });
  }

  function handleDeleteSession(id: string) {
    startTransitionSafe(async () => {
      try {
        await deleteSandboxSession(id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (selectedId === id) setSelectedId(null);
        toast.success(lang === "es" ? "Sesión eliminada" : "Session deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al eliminar la sesión" : "Error deleting the session"));
      }
    });
  }

  // Small helper so delete doesn't need its own dedicated transition/toast bookkeeping.
  function startTransitionSafe(fn: () => Promise<void>) {
    void fn();
  }

  function handleSend() {
    if (!selectedId || !input.trim()) return;
    const content = input.trim();
    setInput("");

    const optimisticUser: AiSandboxMessage = {
      id: `optimistic-${Date.now()}`,
      sessionId: selectedId,
      role: "USER",
      content,
      knowledgeBaseContext: [],
      latencyMs: null,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    startSending(async () => {
      try {
        const result = await sendSandboxMessage(selectedId, content);
        if (!result.success) {
          toast.error(result.error);
          // Resync with the server's ground truth: the user message is
          // persisted even when generation fails, so re-fetch rather than
          // leave a purely local optimistic bubble.
          const s = await getSandboxSession(selectedId);
          setMessages(s.messages);
          return;
        }
        setMessages((prev) => [...prev, result.message]);
        setSessions((prev) =>
          prev.map((s) => (s.id === selectedId ? { ...s, _count: { messages: s._count.messages + 2 } } : s))
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al generar la respuesta" : "Error generating the reply"));
      }
    });
  }

  const selectedSession = sessions.find((s) => s.id === selectedId);

  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="col-span-1">
        <CardContent className="p-3">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">{lang === "es" ? "Sesiones de prueba" : "Test sessions"}</p>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Plus className="h-4 w-4" />{lang === "es" ? "Nueva" : "New"}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{lang === "es" ? "Nueva sesión de sandbox" : "New sandbox session"}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>{lang === "es" ? "Nombre (opcional)" : "Name (optional)"}</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={lang === "es" ? "Prueba de saludo v2" : "Greeting test v2"} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{lang === "es" ? "Prompt/versión a probar (opcional)" : "Prompt/version to test (optional)"}</Label>
                    <Select value={newVersionId} onValueChange={setNewVersionId}>
                      <SelectTrigger><SelectValue placeholder={lang === "es" ? "Usar el prompt SYSTEM activo" : "Use the active SYSTEM prompt"} /></SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
                  <Button onClick={handleCreateSession} disabled={creating}>
                    {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                    {lang === "es" ? "Crear" : "Create"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {sessions.length === 0 ? (
            <EmptyState icon={MessageSquare} title={lang === "es" ? "Sin sesiones" : "No sessions"} description={lang === "es" ? "Crea una sesión para empezar a probar." : "Create a session to start testing."} />
          ) : (
            <div className="space-y-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                    selectedId === s.id ? "bg-brand-50 text-brand-700" : "hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <span className="truncate">{s.name}</span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-slate-400">{s._count.messages}</span>
                    <Trash2
                      className="h-3.5 w-3.5 text-slate-300 hover:text-red-500"
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                    />
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="col-span-2">
        <CardContent className="flex h-[32rem] flex-col p-3">
          {!selectedSession ? (
            <EmptyState icon={MessageSquare} title={lang === "es" ? "Selecciona o crea una sesión" : "Select or create a session"} className="flex-1 justify-center" />
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
                {loadingMessages ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                ) : messages.length === 0 ? (
                  <EmptyState icon={MessageSquare} title={lang === "es" ? "Sin mensajes" : "No messages"} description={lang === "es" ? "Escribe algo para probar el asistente." : "Type something to test the assistant."} />
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={cn("flex", m.role === "USER" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                          m.role === "USER" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-900"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        {m.role === "ASSISTANT" && (
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {m.latencyMs != null && (
                              <Badge variant="secondary" className="text-[10px]">{m.latencyMs} ms</Badge>
                            )}
                            {m.knowledgeBaseContext.length > 0 && (
                              <Badge variant="info" className="text-[10px]">
                                <BookOpen className="mr-1 h-3 w-3" />
                                {m.knowledgeBaseContext.length} {lang === "es" ? "fuente(s)" : "source(s)"}
                              </Badge>
                            )}
                          </div>
                        )}
                        <p className={cn("mt-1 text-[10px]", m.role === "USER" ? "text-brand-100" : "text-slate-400")}>
                          {formatDate(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !sending) handleSend(); }}
                  placeholder={lang === "es" ? "Escribe un mensaje de prueba..." : "Type a test message..."}
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={sending || !input.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
