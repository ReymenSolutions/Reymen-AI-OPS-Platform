"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Play, Split, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  createExperiment, runExperimentSample, judgeExperimentSample, completeExperiment,
} from "@/actions/ai-lab";
import type { PromptExperiment, PromptExperimentSample, PromptVersion, PromptType } from "@prisma/client";
import type { PromptWithVersions } from "./AiLabWorkspace";
import { versionOptionsForType } from "./version-options";

type ExperimentWithDetail = PromptExperiment & {
  variantA: PromptVersion;
  variantB: PromptVersion;
  samples: PromptExperimentSample[];
};

const PROMPT_TYPE_LABELS: Record<PromptType, string> = {
  SYSTEM: "Sistema",
  GREETING: "Saludo",
  LEAD_QUALIFICATION: "Calificación de leads",
  APPOINTMENT_BOOKING: "Agendamiento",
  FAQ: "FAQ",
  ESCALATION: "Escalación",
};

interface ExperimentsPanelProps {
  prompts: PromptWithVersions[];
  initialExperiments: ExperimentWithDetail[];
}

export function ExperimentsPanel({ prompts, initialExperiments }: ExperimentsPanelProps) {
  const [experiments, setExperiments] = useState(initialExperiments);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, startCreating] = useTransition();
  const [form, setForm] = useState<{ promptType: PromptType; name: string; variantAId?: string; variantBId?: string }>({
    promptType: "SYSTEM", name: "",
  });
  const [sampleInput, setSampleInput] = useState<Record<string, string>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [winnerChoice, setWinnerChoice] = useState<Record<string, "A" | "B" | "TIE">>({});

  const options = versionOptionsForType(prompts, form.promptType);

  function handleCreate() {
    if (!form.name.trim() || !form.variantAId || !form.variantBId) {
      toast.error("Completa nombre y ambas versiones");
      return;
    }
    startCreating(async () => {
      try {
        const result = await createExperiment({
          promptType: form.promptType, name: form.name, variantAId: form.variantAId!, variantBId: form.variantBId!,
        });
        const variantA = prompts.flatMap((p) => p.versions).find((v) => v.id === form.variantAId)!;
        const variantB = prompts.flatMap((p) => p.versions).find((v) => v.id === form.variantBId)!;
        setExperiments((prev) => [
          {
            id: result.experimentId, organizationId: "", promptType: form.promptType, name: form.name,
            variantAId: form.variantAId!, variantBId: form.variantBId!, status: "RUNNING", winnerVariant: null,
            createdAt: new Date(), completedAt: null, variantA, variantB, samples: [],
          },
          ...prev,
        ]);
        setCreateOpen(false);
        setForm({ promptType: "SYSTEM", name: "" });
        toast.success("Experimento creado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al crear el experimento");
      }
    });
  }

  async function handleRunSample(experimentId: string) {
    const userMessage = sampleInput[experimentId]?.trim();
    if (!userMessage) return;
    setRunningId(experimentId);
    try {
      const outcome = await runExperimentSample(experimentId, userMessage);
      if (!outcome.success) {
        toast.error(outcome.error);
        return;
      }
      setExperiments((prev) =>
        prev.map((exp) => (exp.id === experimentId ? { ...exp, samples: [outcome.sample, ...exp.samples] } : exp))
      );
      setSampleInput((prev) => ({ ...prev, [experimentId]: "" }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al ejecutar la muestra");
    } finally {
      setRunningId(null);
    }
  }

  async function handleJudge(experimentId: string, sampleId: string, preferred: "A" | "B" | "TIE") {
    try {
      await judgeExperimentSample(sampleId, preferred);
      setExperiments((prev) =>
        prev.map((exp) =>
          exp.id === experimentId
            ? { ...exp, samples: exp.samples.map((s) => (s.id === sampleId ? { ...s, preferred } : s)) }
            : exp
        )
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al calificar la muestra");
    }
  }

  async function handleComplete(experimentId: string) {
    const winner = winnerChoice[experimentId];
    if (!winner) { toast.error("Elige un ganador"); return; }
    try {
      await completeExperiment(experimentId, winner);
      setExperiments((prev) =>
        prev.map((exp) =>
          exp.id === experimentId ? { ...exp, status: "COMPLETED", winnerVariant: winner, completedAt: new Date() } : exp
        )
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cerrar el experimento");
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4" />Nuevo experimento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo experimento A/B</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Sistema: tono formal vs. casual" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de prompt</Label>
                <Select
                  value={form.promptType}
                  onValueChange={(v) => setForm((f) => ({ ...f, promptType: v as PromptType, variantAId: undefined, variantBId: undefined }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROMPT_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Variante A</Label>
                <Select value={form.variantAId} onValueChange={(v) => setForm((f) => ({ ...f, variantAId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Elegir versión" /></SelectTrigger>
                  <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Variante B</Label>
                <Select value={form.variantBId} onValueChange={(v) => setForm((f) => ({ ...f, variantBId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Elegir versión" /></SelectTrigger>
                  <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Crear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {experiments.length === 0 ? (
        <Card><CardContent className="py-0">
          <EmptyState icon={Split} title="Sin experimentos" description="Compara dos versiones del mismo tipo de prompt lado a lado." />
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <Card key={exp.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{exp.name}</p>
                    <p className="text-xs text-slate-500">
                      A: v{exp.variantA.version} · B: v{exp.variantB.version} · {PROMPT_TYPE_LABELS[exp.promptType]}
                    </p>
                  </div>
                  {exp.status === "COMPLETED" ? (
                    <Badge variant="success"><Trophy className="mr-1 h-3 w-3" />Ganador: {exp.winnerVariant}</Badge>
                  ) : (
                    <Badge variant="warning">En curso</Badge>
                  )}
                </div>

                {exp.status === "RUNNING" && (
                  <div className="mt-3 flex gap-2">
                    <Input
                      value={sampleInput[exp.id] ?? ""}
                      onChange={(e) => setSampleInput((prev) => ({ ...prev, [exp.id]: e.target.value }))}
                      placeholder="Mensaje de prueba para comparar ambas variantes"
                      onKeyDown={(e) => { if (e.key === "Enter") handleRunSample(exp.id); }}
                    />
                    <Button size="sm" variant="outline" onClick={() => handleRunSample(exp.id)} disabled={runningId === exp.id}>
                      {runningId === exp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </Button>
                  </div>
                )}

                {exp.samples.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {exp.samples.map((s) => (
                      <div key={s.id} className="rounded-md bg-slate-50 p-2.5 text-xs">
                        <p className="mb-1.5 font-medium text-slate-600">&ldquo;{s.userMessage}&rdquo;</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className={cn("rounded border p-2", s.preferred === "A" ? "border-emerald-300 bg-emerald-50" : "border-slate-200")}>
                            <p className="mb-1 text-[10px] font-semibold text-slate-400">VARIANTE A</p>
                            <p className="whitespace-pre-wrap text-slate-700">{s.replyA}</p>
                          </div>
                          <div className={cn("rounded border p-2", s.preferred === "B" ? "border-emerald-300 bg-emerald-50" : "border-slate-200")}>
                            <p className="mb-1 text-[10px] font-semibold text-slate-400">VARIANTE B</p>
                            <p className="whitespace-pre-wrap text-slate-700">{s.replyB}</p>
                          </div>
                        </div>
                        {exp.status === "RUNNING" && (
                          <div className="mt-1.5 flex gap-1">
                            <Button size="sm" variant={s.preferred === "A" ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => handleJudge(exp.id, s.id, "A")}>Prefiero A</Button>
                            <Button size="sm" variant={s.preferred === "B" ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => handleJudge(exp.id, s.id, "B")}>Prefiero B</Button>
                            <Button size="sm" variant={s.preferred === "TIE" ? "default" : "outline"} className="h-6 px-2 text-[10px]" onClick={() => handleJudge(exp.id, s.id, "TIE")}>Empate</Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {exp.status === "RUNNING" && exp.samples.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                    <Select value={winnerChoice[exp.id]} onValueChange={(v) => setWinnerChoice((prev) => ({ ...prev, [exp.id]: v as "A" | "B" | "TIE" }))}>
                      <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Elegir ganador" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">Variante A</SelectItem>
                        <SelectItem value="B">Variante B</SelectItem>
                        <SelectItem value="TIE">Empate</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={() => handleComplete(exp.id)}>Cerrar experimento</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
