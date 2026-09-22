"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logFoodDishSales } from "@/actions/food";
import { usePreferences } from "@/context/preferences";

export interface FoodVariantForSalesEntry {
  variantId: string;
  // "Berry Bloom — Chico", o solo "Café Americano" si el platillo tiene
  // una única variante (ya viene resuelto desde getFoodDishesWithCost).
  displayName: string;
  todayQuantity: number;
}

function todayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function FoodDailyDishSalesForm({ variants }: { variants: FoodVariantForSalesEntry[] }) {
  const { lang } = usePreferences();
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(variants.map((v) => [v.variantId, String(v.todayQuantity)]))
  );
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    try {
      const entries = variants
        .map((v) => ({ variantId: v.variantId, quantity: Number(quantities[v.variantId] ?? 0) }))
        .filter((e) => Number.isFinite(e.quantity) && e.quantity >= 0);
      await logFoodDishSales({ date: todayIso(), entries });
      toast.success(lang === "es" ? "Ventas de hoy guardadas" : "Today's sales saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al guardar" : "Error saving"));
    } finally {
      setLoading(false);
    }
  }

  if (variants.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{lang === "es" ? "Ventas de hoy por platillo" : "Today's sales by dish"}</CardTitle>
        <p className="text-xs text-slate-500">
          {lang === "es"
            ? "Cuántas unidades de cada platillo (o variante) vendiste hoy. Guardar de nuevo reemplaza el número, no lo suma."
            : "How many units of each dish (or variant) you sold today. Saving again replaces the number, it doesn't add to it."}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {variants.map((variant) => (
          <div key={variant.variantId} className="flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{variant.displayName}</span>
            <input
              type="number"
              min="0"
              step="1"
              value={quantities[variant.variantId] ?? "0"}
              onChange={(e) => setQuantities((prev) => ({ ...prev, [variant.variantId]: e.target.value }))}
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
