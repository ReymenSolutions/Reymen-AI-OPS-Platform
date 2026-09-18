"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { updateTemplatePackageItems } from "@/actions/admin/template-packages";
import { usePreferences } from "@/context/preferences";

interface TemplateOption {
  id: string;
  name: string;
  industry: string;
  iconEmoji: string;
}

export function EditPackageItemsDialog({
  packageId,
  templates,
  currentTemplateIds,
}: {
  packageId: string;
  templates: TemplateOption[];
  currentTemplateIds: string[];
}) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(currentTemplateIds);
  const [itemsError, setItemsError] = useState<string | null>(null);

  function toggleTemplate(id: string) {
    setSelectedTemplateIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function handleSave() {
    if (selectedTemplateIds.length === 0) {
      setItemsError(lang === "es" ? "Selecciona al menos un template" : "Select at least one template");
      return;
    }
    setItemsError(null);
    setLoading(true);
    try {
      await updateTemplatePackageItems(packageId, { templateIds: selectedTemplateIds });
      toast.success(lang === "es" ? "Templates del paquete actualizados" : "Package templates updated");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al actualizar" : "Error updating"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setSelectedTemplateIds(currentTemplateIds); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="h-4 w-4" />{lang === "es" ? "Editar templates" : "Edit templates"}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{lang === "es" ? "Editar templates del paquete" : "Edit package templates"}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label>{lang === "es" ? "Templates incluidos *" : "Included templates *"}</Label>
          {templates.length === 0 ? (
            <p className="text-xs text-slate-400">{lang === "es" ? "No hay templates publicados todavía." : "No published templates yet."}</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {templates.map((t) => (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedTemplateIds.includes(t.id)}
                    onChange={() => toggleTemplate(t.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span>{t.iconEmoji}</span>
                  <span className="flex-1">{t.name}</span>
                </label>
              ))}
            </div>
          )}
          {itemsError && <p className="text-xs text-red-500">{itemsError}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
          <Button type="button" onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {lang === "es" ? "Guardar" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
