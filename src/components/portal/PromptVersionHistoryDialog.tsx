"use client";

import { useState } from "react";
import { toast } from "sonner";
import { History, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { listPromptVersions, rollbackPromptVersion } from "@/actions/prompts";
import { usePreferences } from "@/context/preferences";
import type { PromptVersion } from "@prisma/client";

interface PromptVersionHistoryDialogProps {
  promptId: string;
  promptName: string;
}

export function PromptVersionHistoryDialog({ promptId, promptName }: PromptVersionHistoryDialogProps) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  async function handleOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        setVersions(await listPromptVersions(promptId));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al cargar el historial" : "Error loading history"));
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleRollback(versionId: string) {
    setRollingBack(versionId);
    try {
      await rollbackPromptVersion(promptId, versionId);
      setVersions(await listPromptVersions(promptId));
      toast.success(lang === "es" ? "Prompt restaurado a esa versión" : "Prompt restored to that version");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al restaurar la versión" : "Error restoring version"));
    } finally {
      setRollingBack(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title={lang === "es" ? "Historial de versiones" : "Version history"}>
          <History className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Historial de versiones" : "Version history"} — {promptName}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {versions.map((v) => (
              <div key={v.id} className={`rounded-lg border p-3 ${v.isLatest ? "border-emerald-200 bg-emerald-50" : "border-slate-100"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">v{v.version}</span>
                      {v.isLatest && <Badge variant="success" className="text-[10px]">{lang === "es" ? "Actual" : "Current"}</Badge>}
                    </div>
                    {v.changelog && <p className="mt-0.5 text-xs text-slate-500">{v.changelog}</p>}
                    <p className="mt-1 text-xs text-slate-400 font-mono line-clamp-2">{v.content}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatDate(v.createdAt)}</p>
                  </div>
                  {!v.isLatest && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0"
                      disabled={rollingBack === v.id}
                      onClick={() => handleRollback(v.id)}
                    >
                      {rollingBack === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      {lang === "es" ? "Restaurar" : "Restore"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
