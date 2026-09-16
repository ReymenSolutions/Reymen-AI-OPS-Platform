"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import { setReminderRules } from "@/actions/appointment-reminders";

interface RuleRow {
  offsetMinutes: number;
  channel: string;
  template: string;
  isActive: boolean;
}

const DEFAULT_TEMPLATE_ES = "Hola {{contactName}}, te recordamos tu cita \"{{title}}\" el {{startTime}}.";
const DEFAULT_TEMPLATE_EN = "Hi {{contactName}}, this is a reminder of your appointment \"{{title}}\" on {{startTime}}.";

export function ReminderRulesManager({ initialRules }: { initialRules: RuleRow[] }) {
  const { lang } = usePreferences();
  const [rules, setRules] = useState<RuleRow[]>(initialRules);
  const [isPending, startTransition] = useTransition();

  function addRule() {
    setRules((prev) => [
      ...prev,
      { offsetMinutes: 1440, channel: "whatsapp", template: lang === "es" ? DEFAULT_TEMPLATE_ES : DEFAULT_TEMPLATE_EN, isActive: true },
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
        await setReminderRules(rules);
        toast.success(lang === "es" ? "Reglas de recordatorio guardadas" : "Reminder rules saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al guardar" : "Error saving"));
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        {lang === "es"
          ? "La plataforma solo guarda esta configuración. El envío real del recordatorio lo dispara la automatización conectada en el momento indicado."
          : "The platform only stores this configuration. The connected automation actually sends the reminder at the configured time."}
      </p>
      {rules.map((rule, i) => (
        <div key={i} className="space-y-2 rounded-md border border-slate-100 p-3">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={5}
              value={rule.offsetMinutes}
              onChange={(e) => updateRule(i, { offsetMinutes: Number(e.target.value) })}
              className="h-8 w-24 text-sm"
            />
            <span className="text-xs text-slate-500">{lang === "es" ? "minutos antes de la cita" : "minutes before the appointment"}</span>
            <button onClick={() => removeRule(i)} className="ml-auto rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
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
