"use client";

import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INDUSTRIES } from "@/components/admin/CreateTemplateDialog";
import { createTemplatePackage } from "@/actions/admin/template-packages";

interface TemplateOption {
  id: string;
  name: string;
  industry: string;
  iconEmoji: string;
}

const EMOJIS = ["📦", "🚀", "⭐", "🏆", "🎁", "💼"];

const schema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres"),
  description: z.string().min(10, "Mínimo 10 caracteres"),
  industry: z.string().min(1, "Selecciona una industria"),
});

type FormData = z.infer<typeof schema>;

export function CreateTemplatePackageDialog({ templates }: { templates: TemplateOption[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState("📦");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const industry = watch("industry");
  const orderedTemplates = useMemo(() => {
    if (!industry) return templates;
    return [...templates].sort((a, b) => (a.industry === industry ? -1 : 0) - (b.industry === industry ? -1 : 0));
  }, [templates, industry]);

  function toggleTemplate(id: string) {
    setSelectedTemplateIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function onSubmit(data: FormData) {
    if (selectedTemplateIds.length === 0) {
      setItemsError("Selecciona al menos un template");
      return;
    }
    setItemsError(null);
    setLoading(true);
    try {
      await createTemplatePackage({ ...data, iconEmoji: selectedEmoji, templateIds: selectedTemplateIds });
      toast.success("Paquete creado exitosamente");
      reset();
      setSelectedTemplateIds([]);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al crear paquete");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" />Nuevo paquete</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Crear paquete por industria</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Ícono</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setSelectedEmoji(e)}
                  className={`h-9 w-9 rounded-lg border text-lg transition-colors ${
                    selectedEmoji === e ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nombre *</Label>
            <Input placeholder="Paquete inicial de Clínica" {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Industria *</Label>
            <Select onValueChange={(v) => setValue("industry", v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => (
                  <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.industry && <p className="text-xs text-red-500">{errors.industry.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Descripción *</Label>
            <Textarea placeholder="Lo esencial para arrancar una clínica con Reymen AI Ops" rows={2} {...register("description")} />
            {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Templates incluidos *</Label>
            {templates.length === 0 ? (
              <p className="text-xs text-slate-400">No hay templates publicados todavía. Publica al menos uno primero.</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                {orderedTemplates.map((t) => (
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear paquete
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
