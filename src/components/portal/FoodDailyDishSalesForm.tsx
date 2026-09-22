"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logFoodDishSales } from "@/actions/food";
import { usePreferences } from "@/context/preferences";

export interface FoodDishForSalesEntry {
  id: string;
  name: string;
  todayQuantity: number;
}

function todayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function FoodDailyDishSalesForm({ dishes }: { dishes: FoodDishForSalesEntry[] }) {
  const { lang } = usePreferences();
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(dishes.map((d) => [d.id, String(d.todayQuantity)]))
  );
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    try {
      const entries = dishes
        .map((d) => ({ dishId: d.id, quantity: Number(quantities[d.id] ?? 0) }))
        .filter((e) => Number.isFinite(e.quantity) && e.quantity >= 0);
      await logFoodDishSales({ date: todayIso(), entries });
      toast.success(lang === "es" ? "Ventas de hoy guardadas" : "Today's sales saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al guardar" : "Error saving"));
    } finally {
      setLoading(false);
    }
  }

  if (dishes.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{lang === "es" ? "Ventas de hoy por platillo" : "Today's sales by dish"}</CardTitle>
        <p className="text-xs text-slate-500">
          {lang === "es"
            ? "Cuántas unidades de cada platillo vendiste hoy. Guardar de nuevo reemplaza el número, no lo suma."
            : "How many units of each dish you sold today. Saving again replaces the number, it doesn't add to it."}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {dishes.map((dish) => (
          <div key={dish.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{dish.name}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={quantities[dish.id] ?? "0"}
              onChange={(e) => setQuantities((prev) => ({ ...prev, [dish.id]: e.target.value }))}
              className="w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500"
            />
          </div>
        ))}
        <Button size="sm" onClick={handleSave} disabled={loading} className="mt-2 w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {lang === "es" ? "Guardar ventas de hoy" : "Save today's sales"}
        </Button>
      </CardContent>
    </Card>
  );
}
