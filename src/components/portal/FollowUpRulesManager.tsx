"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferences } from "@/context/preferences";
import { setFollowUpRules } from "@/actions/follow-up-rules";
import type { LeadStatus } from "@prisma/client";

interface RuleRow {
  name: string;
  triggerStatus: LeadStatus;
  delayMinutes: number;
  repeatIntervalMinutes: number | null;
  maxAttempts: number;
  channel: string;
  template: string;
  isActive: boolean;
}

const STATUS_OPTIONS: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL"];

const DEFAULT_TEMPLATE_ES = "Hola {{contactName}}, ¿sigues interesado? Con gusto resolvemos tus dudas.";
const DEFAULT_TEMPLATE_EN = "Hi {{contactName}}, are you still interested? Happy to answer any questions.";

export function FollowUpRulesManager({ initialRules }: { initialRules: RuleRow[] }) {
  const { lang } = usePreferences();
  const [rules, setRules] = useState<RuleRow[]>(initialRules);
  const [isPending, startTransition] = useTransition();

  const statusLabels: Record<LeadStatus, string> = {
    NEW: lang === "es" ? "Nuevo" : "New",
    CONTACTED: lang === "es" ? "Contactado" : "Contacted",
    QUALIFIED: lang === "es" ? "Calificado" : "Qualified",
    PROPOSAL: lang === "es" ? "Propuesta" : "Proposal",
    WON: lang === "es" ? "Ganado" : "Won",
    LOST: lang === "es" ? "Perdido" : "Lost",
  };

  function addRule() {
    setRules((prev) => [
      ...prev,
      {
        name: lang === "es" ? "Nueva regla" : "New rule",
        triggerStatus: "NEW",
        delayMinutes: 1440,
        repeatIntervalMinutes: null,
        maxAttempts: 1,
        channel: "whatsapp",
        template: lang === "es" ? DEFAULT_TEMPLATE_ES : DEFAULT_TEMPLATE_EN,
        isActive: true,
      },
    ]);
  }

  function updateRule(index: number, patch: Partial<RuleRow>) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await setFollowUpRules(rules);
        toast.success(lang === "es" ? "Reglas de seguimiento guardadas" : "Follow-up rules saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al guardar" : "Error saving"));
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        {lang === "es"
          ? "La plataforma solo guarda esta configuración. El envío real del seguimiento lo dispara la automatización conectada, respetando el opt-out de cada lead."
          : "The platform only stores this configuration. The connected automation actually sends the follow-up, respecting each lead's opt-out."}
      </p>
      {rules.map((rule, i) => (
        <div key={i} className="space-y-2 rounded-md border border-slate-100 p-3">
          <div className="flex items-center gap-2">
            <Input
              value={rule.name}
              onChange={(e) => updateRule(i, { name: e.target.value })}
              className="h-8 flex-1 text-sm"
              placeholder={lang === "es" ? "Nombre de la regla" : "Rule name"}
            />
            <button onClick={() => removeRule(i)} className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-500">{lang === "es" ? "Estado del lead" : "Lead status"}</label>
              <Select value={rule.triggerStatus} onValueChange={(v) => updateRule(i, { triggerStatus: v as LeadStatus })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">{lang === "es" ? "Espera (min)" : "Delay (min)"}</label>
              <Input
                type="number" min={5} value={rule.delayMinutes}
                onChange={(e) => updateRule(i, { delayMinutes: Number(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">{lang === "es" ? "Repetir cada (min)" : "Repeat every (min)"}</label>
              <Input
                type="number" min={5}
                value={rule.repeatIntervalMinutes ?? ""}
                placeholder={lang === "es" ? "Sin repetir" : "No repeat"}
                onChange={(e) => updateRule(i, { repeatIntervalMinutes: e.target.value ? Number(e.target.value) : null })}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">{lang === "es" ? "Máx. intentos" : "Max attempts"}</label>
              <Input
                type="number" min={1} max={20} value={rule.maxAttempts}
                onChange={(e) => updateRule(i, { maxAttempts: Number(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <Textarea
            value={rule.template}
            onChange={(e) => updateRule(i, { template: e.target.value })}
            rows={2}
            className="text-sm"
            placeholder={lang === "es" ? "Plantilla del mensaje" : "Message template"}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={addRule}>
          <Plus className="h-3.5 w-3.5" />
          {lang === "es" ? "Agregar regla" : "Add rule"}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {lang === "es" ? "Guardar reglas" : "Save rules"}
        </Button>
      </div>
    </div>
  );
}
