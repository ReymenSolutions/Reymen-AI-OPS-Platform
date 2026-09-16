"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferences } from "@/context/preferences";
import { moveOpportunityStage } from "@/actions/opportunities";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface StageOption { id: string; name: string }

interface OpportunityCardProps {
  opportunity: {
    id: string;
    title: string;
    amount: number | null;
    currency: string;
    estimatedCloseDate: Date | null;
    leadId: string;
    leadName: string;
    ownerName: string | null;
    currentStageId: string;
  };
  stages: StageOption[];
  canManage: boolean;
}

export function OpportunityCard({ opportunity, stages, canManage }: OpportunityCardProps) {
  const { lang } = usePreferences();
  const [isPending, startTransition] = useTransition();

  function handleStageChange(stageId: string) {
    if (stageId === opportunity.currentStageId) return;
    startTransition(async () => {
      try {
        await moveOpportunityStage(opportunity.id, stageId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al mover la oportunidad" : "Error moving opportunity"));
      }
    });
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <Link href={`/portal/leads/${opportunity.leadId}`} className="block hover:underline">
        <p className="text-sm font-medium text-slate-900">{opportunity.title}</p>
      </Link>
      <p className="mt-0.5 text-xs text-slate-500">{opportunity.leadName}</p>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900">
          {opportunity.amount != null ? formatCurrency(opportunity.amount, opportunity.currency) : "—"}
        </span>
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
      </div>

      {(opportunity.ownerName || opportunity.estimatedCloseDate) && (
        <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
          <span>{opportunity.ownerName ?? ""}</span>
          {opportunity.estimatedCloseDate && <span>{formatDate(opportunity.estimatedCloseDate)}</span>}
        </div>
      )}

      {canManage && (
        <div className="mt-2">
          <Select value={opportunity.currentStageId} onValueChange={handleStageChange} disabled={isPending}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
