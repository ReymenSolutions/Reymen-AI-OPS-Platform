"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteFoodDishCategory } from "@/actions/food";
import { usePreferences } from "@/context/preferences";

export function FoodDishCategoryDeleteButton({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const { lang } = usePreferences();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(
      lang === "es"
        ? `¿Borrar la categoría "${categoryName}"? Los platillos que la tenían quedarán sin categoría.`
        : `Delete the category "${categoryName}"? Dishes that had it will become uncategorized.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      await deleteFoodDishCategory(categoryId);
      toast.success(lang === "es" ? "Categoría borrada" : "Category deleted");
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
