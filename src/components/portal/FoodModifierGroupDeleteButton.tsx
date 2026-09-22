"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteFoodModifierGroup } from "@/actions/food";
import { usePreferences } from "@/context/preferences";

export function FoodModifierGroupDeleteButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { lang } = usePreferences();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(
      lang === "es"
        ? `¿Borrar el grupo "${groupName}"? Se quitará de cualquier platillo que lo tenga asignado.`
        : `Delete the group "${groupName}"? It will be removed from any dish it's assigned to.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      await deleteFoodModifierGroup(groupId);
      toast.success(lang === "es" ? "Grupo borrado" : "Group deleted");
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
      className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
      title={lang === "es" ? "Borrar" : "Delete"}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </Button>
  );
}
