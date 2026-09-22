"use client";

import { useState } from "react";
import { Loader2, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleFoodOperatingCostActive } from "@/actions/food";
import { usePreferences } from "@/context/preferences";

export function FoodOperatingCostToggle({ costId, isActive }: { costId: string; isActive: boolean }) {
  const { lang } = usePreferences();
  const [loading, setLoading] = useState(false);
  const nextActive = !isActive;

  async function handleClick() {
    setLoading(true);
    try {
      await toggleFoodOperatingCostActive(costId, nextActive);
      toast.success(
        nextActive
          ? (lang === "es" ? "Gasto activado" : "Cost activated")
          : (lang === "es" ? "Gasto desactivado" : "Cost deactivated")
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className={`h-7 w-7 p-0 ${isActive ? "text-slate-400 hover:text-red-600" : "text-slate-400 hover:text-emerald-600"}`}
      title={isActive ? (lang === "es" ? "Desactivar" : "Deactivate") : (lang === "es" ? "Activar" : "Activate")}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
    </Button>
  );
}
