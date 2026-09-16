"use client";

import { useState, useTransition } from "react";
import { ArrowUp, ArrowDown, Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePreferences } from "@/context/preferences";
import {
  createPipelineStage, updatePipelineStage, swapPipelineStageOrder, deletePipelineStage,
} from "@/actions/pipeline-stages";

interface StageRow {
  id: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
  opportunityCount: number;
}

export function PipelineStagesPanel({ stages, canManage }: { stages: StageRow[]; canManage: boolean }) {
  const { lang } = usePreferences();
  const [newName, setNewName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleRename(stageId: string, name: string) {
    if (!name.trim()) return;
    startTransition(async () => {
      try {
        await updatePipelineStage({ stageId, name: name.trim() });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al renombrar" : "Error renaming"));
      }
    });
  }

  function handleToggle(stageId: string, field: "isWon" | "isLost", value: boolean) {
    startTransition(async () => {
      try {
        await updatePipelineStage({ stageId, [field]: value });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al actualizar" : "Error updating"));
      }
    });
  }

  function handleMove(stageId: string, direction: -1 | 1) {
    const index = stages.findIndex((s) => s.id === stageId);
    const target = stages[index + direction];
    if (!target) return;
    startTransition(async () => {
      try {
        await swapPipelineStageOrder(stageId, target.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al reordenar" : "Error reordering"));
      }
    });
  }

  function handleDelete(stageId: string, opportunityCount: number) {
    if (opportunityCount > 0) {
      toast.error(lang === "es" ? "No se puede eliminar una etapa con oportunidades activas" : "Cannot delete a stage with active opportunities");
      return;
    }
    if (!confirm(lang === "es" ? "¿Eliminar esta etapa?" : "Delete this stage?")) return;
    startTransition(async () => {
      try {
        await deletePipelineStage(stageId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al eliminar" : "Error deleting"));
      }
    });
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await createPipelineStage({ name });
        setNewName("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al crear etapa" : "Error creating stage"));
      }
    });
  }

  return (
    <div className="space-y-2">
      {stages.map((stage, i) => (
        <div key={stage.id} className="flex items-center gap-2 rounded-md border border-slate-100 p-2">
          {canManage ? (
            <Input
              defaultValue={stage.name}
              onBlur={(e) => e.target.value !== stage.name && handleRename(stage.id, e.target.value)}
              className="h-8 flex-1 text-sm"
              disabled={isPending}
            />
          ) : (
            <span className="flex-1 text-sm font-medium text-slate-900">{stage.name}</span>
          )}

          {stage.isWon && <Badge variant="success" className="text-xs">{lang === "es" ? "Ganado" : "Won"}</Badge>}
          {stage.isLost && <Badge variant="destructive" className="text-xs">{lang === "es" ? "Perdido" : "Lost"}</Badge>}

          {canManage && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => handleToggle(stage.id, "isWon", !stage.isWon)}
                disabled={isPending}
                className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-50 hover:text-emerald-600"
                title={lang === "es" ? "Marcar como ganado" : "Mark as won"}
              >
                {lang === "es" ? "G" : "W"}
              </button>
              <button
                onClick={() => handleToggle(stage.id, "isLost", !stage.isLost)}
                disabled={isPending}
                className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-50 hover:text-red-600"
                title={lang === "es" ? "Marcar como perdido" : "Mark as lost"}
              >
                {lang === "es" ? "P" : "L"}
              </button>
              <button onClick={() => handleMove(stage.id, -1)} disabled={isPending || i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-50 disabled:opacity-30">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => handleMove(stage.id, 1)} disabled={isPending || i === stages.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-50 disabled:opacity-30">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDelete(stage.id, stage.opportunityCount)}
                disabled={isPending}
                className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      ))}

      {canManage && (
        <div className="flex gap-1.5 pt-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
            placeholder={lang === "es" ? "Nueva etapa..." : "New stage..."}
            className="h-8 text-sm"
          />
          <Button size="sm" variant="outline" onClick={handleCreate} disabled={isPending || !newName.trim()}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}
    </div>
  );
}
