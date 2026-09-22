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
import { createFoodDish, updateFoodDish } from "@/actions/food";
import { usePreferences } from "@/context/preferences";
import { cn } from "@/lib/utils";

export interface FoodInventoryOption {
  id: string;
  name: string;
  unit: string;
  unitCost: number | null;
}

const ingredientSchema = z.object({
  inventoryItemId: z.string().min(1, "Selecciona un insumo"),
  quantity: z.coerce.number().positive("Cantidad debe ser mayor a 0"),
});

const schema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  price: z.coerce.number().positive("El precio debe ser mayor a 0"),
  ingredients: z.array(ingredientSchema).min(1, "Agrega al menos un insumo"),
});

type FormData = z.infer<typeof schema>;

interface ExistingDish {
  id: string;
  name: string;
  price: number;
  ingredients: { inventoryItemId: string; quantity: number }[];
}

interface FoodDishFormDialogProps {
  inventoryItems: FoodInventoryOption[];
  dish?: ExistingDish;
}

function emptyDefaults(): FormData {
  return { name: "", price: undefined as unknown as number, ingredients: [{ inventoryItemId: "", quantity: undefined as unknown as number }] };
}

function dishDefaults(dish: ExistingDish): FormData {
  return { name: dish.name, price: dish.price, ingredients: dish.ingredients };
}

export function FoodDishFormDialog({ inventoryItems, dish }: FoodDishFormDialogProps) {
  const { lang } = usePreferences();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const isEdit = !!dish;

  const {
    register, control, handleSubmit, watch, reset, formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: dish ? dishDefaults(dish) : emptyDefaults(),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "ingredients" });
  const watchedIngredients = watch("ingredients");
  const watchedPrice = Number(watch("price")) || 0;

  const inventoryById = new Map(inventoryItems.map((i) => [i.id, i]));
  const liveCost = (watchedIngredients ?? []).reduce((sum, ing) => {
    const item = inventoryById.get(ing?.inventoryItemId ?? "");
    const qty = Number(ing?.quantity) || 0;
    return sum + (item?.unitCost ?? 0) * qty;
  }, 0);
  const liveMarginPct = watchedPrice > 0 ? ((watchedPrice - liveCost) / watchedPrice) * 100 : null;

  function openDialog() {
    reset(dish ? dishDefaults(dish) : emptyDefaults());
    setOpen(true);
  }

  async function onSubmit(data: FormData) {
    setLoading(true);
    try {
      if (isEdit && dish) {
        await updateFoodDish(dish.id, data);
        toast.success(lang === "es" ? "Platillo actualizado" : "Dish updated");
      } else {
        await createFoodDish(data);
        toast.success(lang === "es" ? "Platillo creado" : "Dish created");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al guardar platillo" : "Error saving dish"));
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
          <Button size="sm" onClick={openDialog}>
            <Plus className="h-4 w-4" />
            {lang === "es" ? "Nuevo platillo" : "New dish"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? (lang === "es" ? "Editar platillo" : "Edit dish") : (lang === "es" ? "Nuevo platillo" : "New dish")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{lang === "es" ? "Nombre *" : "Name *"}</Label>
              <Input placeholder={lang === "es" ? "Tacos al pastor" : "Al pastor tacos"} {...register("name")} />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>{lang === "es" ? "Precio de venta *" : "Sale price *"}</Label>
              <Input type="number" step="0.01" min="0" {...register("price")} />
              {errors.price && <p className="text-xs text-red-500">{errors.price.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{lang === "es" ? "Insumos y cantidades *" : "Ingredients and quantities *"}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ inventoryItemId: "", quantity: undefined as unknown as number })}
              >
                <Plus className="h-3.5 w-3.5" />
                {lang === "es" ? "Agregar" : "Add"}
              </Button>
            </div>
            {errors.ingredients?.message && <p className="text-xs text-red-500">{errors.ingredients.message}</p>}
            {inventoryItems.length === 0 && (
              <p className="text-xs text-amber-600">
                {lang === "es"
                  ? "Todavía no tienes insumos en tu inventario — agrégalos primero."
                  : "You don't have any inventory items yet — add some first."}
              </p>
            )}
            <div className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
              {fields.map((field, index) => (
                <div key={field.id} className="flex flex-col gap-2 rounded-md border border-slate-200 p-2 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1">
                    {index === 0 && <Label className="text-xs">{lang === "es" ? "Insumo" : "Ingredient"}</Label>}
                    <select
                      {...register(`ingredients.${index}.inventoryItemId` as const)}
                      className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm outline-none focus:border-brand-500"
                    >
                      <option value="">{lang === "es" ? "Selecciona..." : "Select..."}</option>
                      {inventoryItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.unit})
                        </option>
                      ))}
                    </select>
                    {errors.ingredients?.[index]?.inventoryItemId && (
                      <p className="text-xs text-red-500">{errors.ingredients[index]?.inventoryItemId?.message}</p>
                    )}
                  </div>
                  <div className="w-full space-y-1 sm:w-28">
                    {index === 0 && <Label className="text-xs">{lang === "es" ? "Cantidad" : "Quantity"}</Label>}
                    <Input type="number" step="0.001" min="0" {...register(`ingredients.${index}.quantity` as const)} />
                    {errors.ingredients?.[index]?.quantity && (
                      <p className="text-xs text-red-500">{errors.ingredients[index]?.quantity?.message}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                    disabled={fields.length === 1}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">{lang === "es" ? "Costo calculado: " : "Calculated cost: "}</span>
            <span className="font-semibold text-slate-900">${liveCost.toFixed(2)}</span>
            {liveMarginPct !== null && (
              <span
                className={cn(
                  "ml-2 text-xs font-medium",
                  liveMarginPct >= 30 ? "text-emerald-600" : liveMarginPct >= 15 ? "text-amber-600" : "text-red-600"
                )}
              >
                · {lang === "es" ? "Margen" : "Margin"}: {liveMarginPct.toFixed(1)}%
              </span>
            )}
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
