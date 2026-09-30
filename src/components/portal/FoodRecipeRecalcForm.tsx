"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recalculateFoodRecipeUsage } from "@/actions/food-inventory";
import { usePreferences } from "@/context/preferences";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { getErrorMessage } from "@/lib/user-error";

function daysAgoLocal(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Aplica las recetas actuales a las ventas desde una fecha y corrige la existencia por la diferencia. */
export function FoodRecipeRecalcForm() {
  const { lang } = usePreferences();
  const f = pickDict(foodStrings, lang);
  const [since, setSince] = useState(() => daysAgoLocal(0));
  const [loading, setLoading] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm(f.recalcConfirm)) return;
    setLoading(true);
    try {
      // Medianoche local del día elegido.
      const result = await recalculateFoodRecipeUsage(new Date(`${since}T00:00:00`).toISOString());
      toast.success(result.items === 0 ? f.recalcNothing : f.recalcDone(result.usages, result.items));
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={run} className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">{f.recalcDesc}</p>
      <div className="space-y-1">
        <Label htmlFor="recalc-since" className="text-xs text-slate-600">{f.recalcSince}</Label>
        <Input id="recalc-since" type="date" required max={daysAgoLocal(0)} value={since} onChange={(e) => setSince(e.target.value)} />
      </div>
      <p className="text-xs text-amber-700">{f.recalcWarning}</p>
      <Button type="submit" variant="outline" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {f.recalcButton}
      </Button>
    </form>
  );
}
