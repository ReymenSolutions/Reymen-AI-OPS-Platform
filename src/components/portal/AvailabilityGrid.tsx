"use client";

import { useState, useTransition } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import { setAvailabilityRules } from "@/actions/availability";

const DAY_LABELS_ES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_LABELS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

interface DayRow {
  enabled: boolean;
  start: string;
  end: string;
}

export function AvailabilityGrid({ initialRules }: { initialRules: { dayOfWeek: number; startMinute: number; endMinute: number }[] }) {
  const { lang } = usePreferences();
  const [isPending, startTransition] = useTransition();
  const labels = lang === "es" ? DAY_LABELS_ES : DAY_LABELS_EN;

  const [days, setDays] = useState<DayRow[]>(() =>
    Array.from({ length: 7 }, (_, dayOfWeek) => {
      const rule = initialRules.find((r) => r.dayOfWeek === dayOfWeek);
      return rule
        ? { enabled: true, start: minutesToTime(rule.startMinute), end: minutesToTime(rule.endMinute) }
        : { enabled: false, start: "09:00", end: "18:00" };
    })
  );

  function updateDay(index: number, patch: Partial<DayRow>) {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function handleSave() {
    const invalid = days.some((d) => d.enabled && timeToMinutes(d.end) <= timeToMinutes(d.start));
    if (invalid) {
      toast.error(lang === "es" ? "La hora de fin debe ser posterior a la de inicio" : "End time must be after start time");
      return;
    }
    startTransition(async () => {
      try {
        const rules = days
          .map((d, dayOfWeek) => ({ dayOfWeek, ...d }))
          .filter((d) => d.enabled)
          .map((d) => ({ dayOfWeek: d.dayOfWeek, startMinute: timeToMinutes(d.start), endMinute: timeToMinutes(d.end) }));
        await setAvailabilityRules(rules);
        toast.success(lang === "es" ? "Disponibilidad guardada" : "Availability saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al guardar" : "Error saving"));
      }
    });
  }

  return (
    <div className="space-y-3">
      {days.length === 0 ? null : (
        <p className="text-xs text-slate-400">
          {lang === "es"
            ? "Sin días activados, no hay restricción: se puede agendar a cualquier hora."
            : "With no days enabled, there's no restriction: any time can be booked."}
        </p>
      )}
      <div className="space-y-1.5">
        {days.map((d, i) => (
          <div key={i} className="flex items-center gap-3 rounded-md border border-slate-100 p-2 text-sm">
            <label className="flex w-28 flex-shrink-0 items-center gap-2">
              <input type="checkbox" checked={d.enabled} onChange={(e) => updateDay(i, { enabled: e.target.checked })} />
              {labels[i]}
            </label>
            <input
              type="time"
              value={d.start}
              disabled={!d.enabled}
              onChange={(e) => updateDay(i, { start: e.target.value })}
              className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-40"
            />
            <span className="text-slate-400">—</span>
            <input
              type="time"
              value={d.end}
              disabled={!d.enabled}
              onChange={(e) => updateDay(i, { end: e.target.value })}
              className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-40"
            />
          </div>
        ))}
      </div>
      <Button size="sm" onClick={handleSave} disabled={isPending}>
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {lang === "es" ? "Guardar disponibilidad" : "Save availability"}
      </Button>
    </div>
  );
}
