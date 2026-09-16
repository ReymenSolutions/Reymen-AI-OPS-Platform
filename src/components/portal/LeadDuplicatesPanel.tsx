"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { usePreferences } from "@/context/preferences";
import { mergeLeads } from "@/actions/leads";

interface DuplicateLead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export function LeadDuplicatesPanel({ leadId, duplicates }: { leadId: string; duplicates: DuplicateLead[] }) {
  const { lang } = usePreferences();
  const router = useRouter();
  const [target, setTarget] = useState<DuplicateLead | null>(null);
  const [isPending, startTransition] = useTransition();

  if (duplicates.length === 0) return null;

  function handleMerge() {
    if (!target) return;
    startTransition(async () => {
      try {
        await mergeLeads(leadId, target.id);
        toast.success(lang === "es" ? "Leads fusionados" : "Leads merged");
        setTarget(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al fusionar" : "Error merging leads"));
      }
    });
  }

  return (
    <>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <p className="text-xs font-medium">
            {lang === "es" ? "Posibles contactos duplicados" : "Possible duplicate contacts"}
          </p>
        </div>
        <div className="mt-2 space-y-1.5">
          {duplicates.map((dup) => (
            <div key={dup.id} className="flex items-center justify-between rounded bg-white px-2.5 py-1.5 text-xs">
              <div>
                <p className="font-medium text-slate-800">{dup.name}</p>
                <p className="text-slate-400">{dup.email ?? dup.phone ?? ""}</p>
              </div>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTarget(dup)}>
                {lang === "es" ? "Fusionar" : "Merge"}
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "es" ? "Confirmar fusión" : "Confirm merge"}</DialogTitle>
            <DialogDescription>
              {lang === "es"
                ? `Se moverán las oportunidades, notas y citas de "${target?.name}" a este lead, y "${target?.name}" quedará archivado. Esta acción no se puede deshacer.`
                : `Opportunities, notes and appointments from "${target?.name}" will move to this lead, and "${target?.name}" will be archived. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={isPending}>
              {lang === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button onClick={handleMerge} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Fusionar" : "Merge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
