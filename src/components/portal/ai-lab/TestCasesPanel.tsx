"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Play, Trash2, Check, X, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTestCase, deleteTestCase, runTestCase, gradeTestCaseResult } from "@/actions/ai-lab";
import type { PromptTestCase, PromptTestCaseResult, PromptType } from "@prisma/client";
import type { PromptWithVersions } from "./AiLabWorkspace";
import { versionOptionsForType } from "./version-options";
import { usePreferences } from "@/context/preferences";

type TestCaseWithResults = PromptTestCase & { results: PromptTestCaseResult[] };

const PROMPT_TYPE_LABELS_ES: Record<PromptType, string> = {
  SYSTEM: "Sistema",
  GREETING: "Saludo",
  LEAD_QUALIFICATION: "Calificación de leads",
  APPOINTMENT_BOOKING: "Agendamiento",
  FAQ: "FAQ",
  ESCALATION: "Escalación",
};

const PROMPT_TYPE_LABELS_EN: Record<PromptType, string> = {
  SYSTEM: "System",
  GREETING: "Greeting",
  LEAD_QUALIFICATION: "Lead qualification",
  APPOINTMENT_BOOKING: "Appointment booking",
  FAQ: "FAQ",
  ESCALATION: "Escalation",
};

interface TestCasesPanelProps {
  prompts: PromptWithVersions[];
  initialTestCases: TestCaseWithResults[];
}

export function TestCasesPanel({ prompts, initialTestCases }: TestCasesPanelProps) {
  const { lang } = usePreferences();
  const PROMPT_TYPE_LABELS = lang === "es" ? PROMPT_TYPE_LABELS_ES : PROMPT_TYPE_LABELS_EN;
  const [testCases, setTestCases] = useState(initialTestCases);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, startCreating] = useTransition();
  const [form, setForm] = useState({ promptType: "SYSTEM" as PromptType, name: "", userMessage: "", expectedNotes: "" });
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runVersion, setRunVersion] = useState<Record<string, string>>({});

  function handleCreate() {
    if (!form.name.trim() || !form.userMessage.trim()) return;
    startCreating(async () => {
      try {
        const result = await createTestCase(form);
        setTestCases((prev) => [
          { id: result.testCaseId, organizationId: "", ...form, createdAt: new Date(), updatedAt: new Date(), results: [] },
          ...prev,
        ]);
        setCreateOpen(false);
        setForm({ promptType: "SYSTEM", name: "", userMessage: "", expectedNotes: "" });
        toast.success(lang === "es" ? "Caso de prueba creado" : "Test case created");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al crear el caso de prueba" : "Error creating the test case"));
      }
    });
  }

  async function handleDelete(id: string) {
    try {
      await deleteTestCase(id);
      setTestCases((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al eliminar" : "Error deleting"));
    }
  }

  async function handleRun(testCase: TestCaseWithResults) {
    const versionId = runVersion[testCase.id];
    if (!versionId) { toast.error(lang === "es" ? "Elige qué versión probar" : "Choose which version to test"); return; }
    setRunningId(testCase.id);
    try {
      const outcome = await runTestCase(testCase.id, versionId);
      if (!outcome.success) {
        toast.error(outcome.error);
        return;
      }
      setTestCases((prev) =>
        prev.map((t) => (t.id === testCase.id ? { ...t, results: [outcome.result, ...t.results].slice(0, 5) } : t))
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al ejecutar el caso de prueba" : "Error running the test case"));
    } finally {
      setRunningId(null);
    }
  }

  async function handleGrade(testCaseId: string, resultId: string, passed: boolean) {
    try {
      await gradeTestCaseResult(resultId, passed);
      setTestCases((prev) =>
        prev.map((t) =>
          t.id === testCaseId
            ? { ...t, results: t.results.map((r) => (r.id === resultId ? { ...r, passed } : r)) }
            : t
        )
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al calificar" : "Error grading"));
    }
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4" />{lang === "es" ? "Nuevo caso de prueba" : "New test case"}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{lang === "es" ? "Nuevo caso de prueba" : "New test case"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>{lang === "es" ? "Tipo de prompt" : "Prompt type"}</Label>
                <Select value={form.promptType} onValueChange={(v) => setForm((f) => ({ ...f, promptType: v as PromptType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROMPT_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "es" ? "Nombre" : "Name"}</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={lang === "es" ? "Pregunta por horario de laboratorio" : "Asks about lab hours"} />
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "es" ? "Mensaje del usuario" : "User message"}</Label>
                <Textarea rows={3} value={form.userMessage} onChange={(e) => setForm((f) => ({ ...f, userMessage: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{lang === "es" ? "Qué debería responder (criterio de calificación, opcional)" : "What it should reply (grading criteria, optional)"}</Label>
                <Textarea rows={2} value={form.expectedNotes} onChange={(e) => setForm((f) => ({ ...f, expectedNotes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                {lang === "es" ? "Crear" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {testCases.length === 0 ? (
        <Card><CardContent className="py-0">
          <EmptyState icon={Play} title={lang === "es" ? "Sin casos de prueba" : "No test cases"} description={lang === "es" ? "Guarda un mensaje de prueba para volver a correrlo contra cada nueva versión de un prompt." : "Save a test message to re-run it against each new version of a prompt."} />
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {testCases.map((tc) => {
            const options = versionOptionsForType(prompts, tc.promptType);
            return (
              <Card key={tc.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{tc.name}</p>
                        <Badge variant="secondary" className="text-[10px]">{PROMPT_TYPE_LABELS[tc.promptType]}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">&ldquo;{tc.userMessage}&rdquo;</p>
                      {tc.expectedNotes && <p className="mt-1 text-xs text-slate-400">{lang === "es" ? "Esperado" : "Expected"}: {tc.expectedNotes}</p>}
                    </div>
                    <Trash2 className="h-4 w-4 flex-shrink-0 text-slate-300 hover:text-red-500 cursor-pointer" onClick={() => handleDelete(tc.id)} />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Select value={runVersion[tc.id]} onValueChange={(v) => setRunVersion((prev) => ({ ...prev, [tc.id]: v }))}>
                      <SelectTrigger className="h-8 w-64"><SelectValue placeholder={lang === "es" ? "Elegir versión a probar" : "Choose version to test"} /></SelectTrigger>
                      <SelectContent>
                        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => handleRun(tc)} disabled={runningId === tc.id}>
                      {runningId === tc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      {lang === "es" ? "Ejecutar" : "Run"}
                    </Button>
                  </div>

                  {tc.results.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      {tc.results.map((r) => (
                        <div key={r.id} className="rounded-md bg-slate-50 p-2.5 text-xs">
                          <p className="text-slate-700 whitespace-pre-wrap">{r.reply}</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            {r.latencyMs != null && <Badge variant="secondary" className="text-[10px]">{r.latencyMs} ms</Badge>}
                            {r.knowledgeBaseContext.length > 0 && (
                              <Badge variant="info" className="text-[10px]"><BookOpen className="mr-1 h-3 w-3" />{r.knowledgeBaseContext.length} {lang === "es" ? "fuente(s)" : "source(s)"}</Badge>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                onClick={() => handleGrade(tc.id, r.id, true)}
                                className={cnGrade(r.passed === true, "success")}
                              ><Check className="h-3.5 w-3.5" /></button>
                              <button
                                onClick={() => handleGrade(tc.id, r.id, false)}
                                className={cnGrade(r.passed === false, "destructive")}
                              ><X className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function cnGrade(active: boolean, kind: "success" | "destructive") {
  const base = "flex h-6 w-6 items-center justify-center rounded-full border transition-colors";
  if (!active) return `${base} border-slate-200 text-slate-400 hover:border-slate-300`;
  return kind === "success"
    ? `${base} border-emerald-300 bg-emerald-100 text-emerald-700`
    : `${base} border-red-300 bg-red-100 text-red-700`;
}
