"use client";

import { useState, useTransition } from "react";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { usePreferences } from "@/context/preferences";
import { updateLeadTags } from "@/actions/leads";

export function LeadTagsEditor({ leadId, initialTags }: { leadId: string; initialTags: string[] }) {
  const { lang } = usePreferences();
  const [tags, setTags] = useState(initialTags);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  function persist(next: string[]) {
    setTags(next);
    startTransition(async () => {
      try {
        await updateLeadTags(leadId, next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al actualizar etiquetas" : "Error updating tags"));
      }
    });
  }

  function handleAdd() {
    const value = draft.trim();
    if (!value || tags.includes(value)) { setDraft(""); return; }
    persist([...tags, value]);
    setDraft("");
  }

  function handleRemove(tag: string) {
    persist(tags.filter((t) => t !== tag));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button type="button" onClick={() => handleRemove(tag)} disabled={isPending} className="hover:text-red-600">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {tags.length === 0 && (
          <span className="text-xs text-slate-400">{lang === "es" ? "Sin etiquetas" : "No tags"}</span>
        )}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          placeholder={lang === "es" ? "Agregar etiqueta..." : "Add tag..."}
          className="h-8 text-xs"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !draft.trim()}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
