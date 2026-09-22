"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { createFoodModifierGroup, updateFoodModifierGroup } from "@/actions/food";
import { usePreferences } from "@/context/preferences";

const optionSchema = z.object({
  name: z.string().min(1, "Nombre de opción requerido"),
  priceDelta: z.coerce.number().min(0, "No puede ser negativo"),
});

const schema = z
  .object({
    name: z.string().min(1, "Nombre requerido"),
    minSelect: z.coerce.number().int().min(0),
    maxSelect: z.coerce.number().int().min(1),
    options: z.array(optionSchema).min(1, "Agrega al menos una opción"),
  })
  .refine((data) => data.minSelect <= data.maxSelect, {
    message: "El mínimo no puede ser mayor al máximo",
    path: ["minSelect"],
  });

type FormData = z.infer<typeof schema>;

interface ExistingGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { name: string; priceDelta: number }[];
}

function emptyDefaults(): FormData {
  return { name: "", minSelect: 0, maxSelect: 1, options: [{ name: "", priceDelta: 0 }] };
}

function groupDefaults(group: ExistingGroup): FormData {
  return { name: group.name, minSelect: group.minSelect, maxSelect: group.maxSelect, options: group.options };
}

export function FoodModifierGroupFormDialog({ group }: { group?: ExistingGroup }) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEdit = !!group;

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: group ? groupDefaults(group) : emptyDefaults(),
  });
  const { fields: optionFields, append: appendOption, remove: removeOption } = useFieldArray({ control, name: "options" });

  function openDialog() {
    reset(group ? groupDefaults(group) : emptyDefaults());
    setOpen(true);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      if (isEdit && group) {
        await updateFoodModifierGroup(group.id, data);
        toast.success(lang === "es" ? "Grupo actualizado" : "Group updated");
      } else {
        await createFoodModifierGroup(data);
        toast.success(lang === "es" ? "Grupo creado" : "Group created");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al guardar" : "Error saving"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm" onClick={openDialog} className="h-7 w-7 p-0 text-slate-400 hover:text-brand-600">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={openDialog}>
            <Plus className="h-4 w-4" />
            {lang === "es" ? "Nuevo grupo de modificadores" : "New modifier group"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? (lang === "es" ? "Editar grupo de modificadores" : "Edit modifier group") : (lang === "es" ? "Nuevo grupo de modificadores" : "New modifier group")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{lang === "es" ? "Nombre *" : "Name *"}</Label>
            <Input placeholder={lang === "es" ? "Término, Extras..." : "Doneness, Extras..."} {...register("name")} />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{lang === "es" ? "Mínimo a elegir" : "Min. selections"}</Label>
              <Input type="number" min="0" step="1" {...register("minSelect")} />
              <p className="text-xs text-slate-500">{lang === "es" ? "0 = opcional" : "0 = optional"}</p>
            </div>
            <div className="space-y-2">
              <Label>{lang === "es" ? "Máximo a elegir" : "Max. selections"}</Label>
              <Input type="number" min="1" step="1" {...register("maxSelect")} />
              <p className="text-xs text-slate-500">{lang === "es" ? "1 = elección única" : "1 = single choice"}</p>
            </div>
          </div>
          {errors.minSelect && <p className="text-xs text-red-500">{errors.minSelect.message}</p>}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{lang === "es" ? "Opciones *" : "Options *"}</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => appendOption({ name: "", priceDelta: 0 })}>
                <Plus className="h-3.5 w-3.5" />
                {lang === "es" ? "Agregar" : "Add"}
              </Button>
            </div>
            {typeof errors.options?.message === "string" && <p className="text-xs text-red-500">{errors.options.message}</p>}
            <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
              {optionFields.map((field, index) => (
                <div key={field.id} className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50/60 p-2 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1">
                    {index === 0 && <Label className="text-xs">{lang === "es" ? "Nombre" : "Name"}</Label>}
                    <Input placeholder={lang === "es" ? "Extra queso" : "Extra cheese"} {...register(`options.${index}.name` as const)} />
                    {errors.options?.[index]?.name && <p className="text-xs text-red-500">{errors.options[index]?.name?.message}</p>}
                  </div>
                  <div className="w-full space-y-1 sm:w-28">
                    {index === 0 && <Label className="text-xs">{lang === "es" ? "Precio adicional" : "Extra price"}</Label>}
                    <Input type="number" step="0.01" min="0" {...register(`options.${index}.priceDelta` as const)} />
                    {errors.options?.[index]?.priceDelta && <p className="text-xs text-red-500">{errors.options[index]?.priceDelta?.message}</p>}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOption(index)}
                    disabled={optionFields.length === 1}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {lang === "es" ? "Guardar" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
