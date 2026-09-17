"use client";

import { useState, useTransition } from "react";
import { BellOff, Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePreferences } from "@/context/preferences";
import { setLeadDoNotContact } from "@/actions/leads";

export function LeadDoNotContactToggle({ leadId, initialDoNotContact }: { leadId: string; initialDoNotContact: boolean }) {
  const { lang } = usePreferences();
  const [doNotContact, setDoNotContact] = useState(initialDoNotContact);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const next = !doNotContact;
    startTransition(async () => {
      try {
        await setLeadDoNotContact(leadId, next);
        setDoNotContact(next);
        toast.success(
          next
            ? (lang === "es" ? "Lead marcado como no contactar" : "Lead marked as do-not-contact")
            : (lang === "es" ? "Seguimientos automáticos reactivados" : "Automated follow-ups re-enabled")
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al actualizar" : "Error updating"));
      }
    });
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      className={`flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-xs transition-colors ${
        doNotContact
          ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
          : "border-slate-200 text-slate-500 hover:bg-slate-50"
      }`}
      title={lang === "es" ? "Excluye a este lead de los seguimientos automáticos" : "Excludes this lead from automated follow-ups"}
    >
      <span className="flex items-center gap-1.5">
        {doNotContact ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
        {doNotContact
          ? (lang === "es" ? "No contactar (seguimientos pausados)" : "Do not contact (follow-ups paused)")
          : (lang === "es" ? "Seguimientos automáticos activos" : "Automated follow-ups active")}
      </span>
      {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
    </button>
  );
}
