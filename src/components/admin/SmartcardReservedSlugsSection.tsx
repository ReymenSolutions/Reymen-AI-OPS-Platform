"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSmartcardReservedSlugAction, deleteSmartcardReservedSlugAction } from "@/actions/admin/smartcard-settings";

export function SmartcardReservedSlugsSection({ initial, canEdit }: { initial: string[]; canEdit: boolean }) {
  const [slugs, setSlugs] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [newSlug, setNewSlug] = useState("");

  function handleAdd() {
    const slug = newSlug.trim().toLowerCase();
    if (!slug) {
      toast.error("Faltan campos obligatorios.");
      return;
    }
    startTransition(async () => {
      const result = await addSmartcardReservedSlugAction(slug);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSlugs((prev) => [...prev, slug].sort());
      setNewSlug("");
    });
  }

  function handleDelete(slug: string) {
    startTransition(async () => {
      const result = await deleteSmartcardReservedSlugAction(slug);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSlugs((prev) => prev.filter((s) => s !== slug));
    });
  }

  return (
    <section>
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Slugs reservados ({slugs.length})</h2>
      <p className="mb-3 text-sm text-slate-500">Nadie puede crear un perfil con uno de estos slugs.</p>

      <div className="flex flex-wrap gap-2">
        {slugs.map((s) => (
          <span key={s} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
            {s}
            {canEdit && (
              <button
                type="button"
                disabled={pending}
                onClick={() => handleDelete(s)}
                title="Eliminar"
                className="text-slate-400 hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
      </div>

      {canEdit && (
        <div className="mt-4 flex items-center gap-2">
          <Input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="ej. blog" className="max-w-xs" />
          <Button disabled={pending} onClick={handleAdd}>
            + Agregar
          </Button>
        </div>
      )}
    </section>
  );
}
