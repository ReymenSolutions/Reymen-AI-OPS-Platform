"use client";

import { useState } from "react";
import { Loader2, Power, PowerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteFoodInventoryItem, deleteFoodSupplier, setFoodInventoryItemActive, setFoodSupplierActive } from "@/actions/food-inventory";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

const TEXT = {
  item: {
    es: { activated: "Insumo activado", deactivated: "Insumo desactivado", deleted: "Insumo eliminado", confirm: (n: string) => `¿Eliminar el insumo "${n}"? Si ya se usa en recetas o compras no se podrá; en ese caso desactívalo.` },
    en: { activated: "Supply item activated", deactivated: "Supply item deactivated", deleted: "Supply item deleted", confirm: (n: string) => `Delete the supply item "${n}"? If it's used in recipes or purchases it can't be; deactivate it instead.` },
  },
  supplier: {
    es: { activated: "Proveedor activado", deactivated: "Proveedor desactivado", deleted: "Proveedor eliminado", confirm: (n: string) => `¿Eliminar el proveedor "${n}"? Si ya tiene compras no se podrá; en ese caso desactívalo.` },
    en: { activated: "Supplier activated", deactivated: "Supplier deactivated", deleted: "Supplier deleted", confirm: (n: string) => `Delete the supplier "${n}"? If it has purchases it can't be; deactivate it instead.` },
  },
};

/** Activar/desactivar y eliminar un insumo o proveedor. */
export function FoodArchiveButtons({ kind, id, name, isActive }: { kind: "item" | "supplier"; id: string; name: string; isActive: boolean }) {
  const { lang } = usePreferences();
  const text = TEXT[kind][lang === "en" ? "en" : "es"];
  const [loading, setLoading] = useState<"toggle" | "delete" | null>(null);

  async function toggle() {
    setLoading("toggle");
    try {
      if (kind === "item") await setFoodInventoryItemActive(id, !isActive);
      else await setFoodSupplierActive(id, !isActive);
      toast.success(isActive ? text.deactivated : text.activated);
    } catch (e) {
      toast.error(getErrorMessage(e, "Error"));
    } finally {
      setLoading(null);
    }
  }

  async function remove() {
    if (!window.confirm(text.confirm(name))) return;
    setLoading("delete");
    try {
      if (kind === "item") await deleteFoodInventoryItem(id);
      else await deleteFoodSupplier(id);
      toast.success(text.deleted);
    } catch (e) {
      toast.error(getErrorMessage(e, "Error"));
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggle}
        disabled={loading !== null}
        className={`h-7 w-7 p-0 text-slate-400 ${isActive ? "hover:text-amber-600" : "hover:text-emerald-600"}`}
        title={isActive ? (lang === "es" ? "Desactivar" : "Deactivate") : (lang === "es" ? "Activar" : "Activate")}
      >
        {loading === "toggle" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={remove}
        disabled={loading !== null}
        className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
        title={lang === "es" ? "Eliminar" : "Delete"}
      >
        {loading === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </Button>
    </>
  );
}
