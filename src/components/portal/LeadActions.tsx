"use client";

import { useState } from "react";
import { Loader2, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { updateLeadStatus, deleteLead } from "@/actions/leads";
import { usePreferences } from "@/context/preferences";
import type { LeadStatus } from "@prisma/client";
import { getErrorMessage } from "@/lib/user-error";

interface LeadActionsProps {
  leadId: string;
  currentStatus: LeadStatus;
}

export function LeadActions({ leadId, currentStatus }: LeadActionsProps) {
  const { t } = usePreferences();
  const [status, setStatus] = useState<LeadStatus>(currentStatus);
  const [loading, setLoading] = useState(false);

  const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
    { value: "NEW", label: t.statusNew },
    { value: "CONTACTED", label: t.statusContacted },
    { value: "QUALIFIED", label: t.statusQualified },
    { value: "PROPOSAL", label: t.statusProposal },
    { value: "WON", label: t.statusWon },
    { value: "LOST", label: t.statusLost },
  ];

  async function handleStatusChange(newStatus: LeadStatus) {
    if (newStatus === status) return;
    setLoading(true);
    try {
      await updateLeadStatus(leadId, newStatus);
      setStatus(newStatus);
      toast.success(t.statusUpdated);
    } catch (e) {
      toast.error(getErrorMessage(e, t.error));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t.confirmDeleteLead)) return;
    setLoading(true);
    try {
      await deleteLead(leadId);
      toast.success(t.leadDeleted);
    } catch (e) {
      toast.error(getErrorMessage(e, t.error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <div className="relative">
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
          disabled={loading}
          className="appearance-none rounded border border-slate-200 bg-white py-1 pl-2 pr-6 text-xs text-slate-600 focus:border-brand-400 focus:outline-none disabled:opacity-50 cursor-pointer"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
      </div>
      <button
        onClick={handleDelete}
        disabled={loading}
        className="rounded p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
        title={t.delete}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
