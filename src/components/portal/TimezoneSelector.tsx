"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferences } from "@/context/preferences";
import { setOrgTimezone } from "@/actions/availability";

const COMMON_TIMEZONES = [
  "America/Mexico_City",
  "America/Tijuana",
  "America/Monterrey",
  "America/Cancun",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/Madrid",
];

export function TimezoneSelector({ currentTimezone }: { currentTimezone: string }) {
  const { lang } = usePreferences();
  const [timezone, setTimezone] = useState(currentTimezone);
  const [isPending, startTransition] = useTransition();

  const options = COMMON_TIMEZONES.includes(currentTimezone) ? COMMON_TIMEZONES : [currentTimezone, ...COMMON_TIMEZONES];

  function handleChange(value: string) {
    setTimezone(value);
    startTransition(async () => {
      try {
        await setOrgTimezone(value);
        toast.success(lang === "es" ? "Zona horaria actualizada" : "Timezone updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al actualizar" : "Error updating"));
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={timezone} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger className="h-9 w-64 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((tz) => (
            <SelectItem key={tz} value={tz}>{tz}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
    </div>
  );
}
