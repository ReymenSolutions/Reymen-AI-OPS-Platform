"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateRequestStatus } from "@/actions/requests";
import { usePreferences } from "@/context/preferences";
import type { RequestStatus } from "@prisma/client";

const OPTIONS_ES: { value: RequestStatus; label: string }[] = [
  { value: "OPEN", label: "Abierta" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "RESOLVED", label: "Resuelta" },
  { value: "CLOSED", label: "Cerrada" },
];

const OPTIONS_EN: { value: RequestStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

export function UpdateRequestStatusSelect({
  requestId,
  currentStatus,
}: {
  requestId: string;
  currentStatus: RequestStatus;
}) {
  const { lang } = usePreferences();
  const OPTIONS = lang === "es" ? OPTIONS_ES : OPTIONS_EN;
  const [status, setStatus] = useState<RequestStatus>(currentStatus);
  const [loading, setLoading] = useState(false);

  async function handleChange(newStatus: RequestStatus) {
    if (newStatus === status) return;
    setLoading(true);
    try {
      await updateRequestStatus(requestId, newStatus);
      setStatus(newStatus);
      toast.success(lang === "es" ? "Estado actualizado" : "Status updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <select
      value={status}
      onChange={(e) => handleChange(e.target.value as RequestStatus)}
      disabled={loading}
      className="rounded border border-slate-200 bg-white py-1 px-2 text-xs text-slate-600 focus:border-brand-400 focus:outline-none disabled:opacity-50 cursor-pointer"
    >
      {OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
