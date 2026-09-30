"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { voidFoodPurchase } from "@/actions/food-inventory";
import { usePreferences } from "@/context/preferences";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { getErrorMessage } from "@/lib/user-error";

/** Anula una compra capturada por error; pide el motivo porque queda en la bitácora. */
export function FoodPurchaseVoidDialog({ purchaseId }: { purchaseId: string }) {
  const { lang } = usePreferences();
  const f = pickDict(foodStrings, lang);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");

  async function confirm() {
    setLoading(true);
    try {
      await voidFoodPurchase(purchaseId, reason);
      toast.success(f.purchaseVoided);
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, lang === "es" ? "Error al guardar" : "Error saving"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" onClick={() => { setReason(""); setOpen(true); }} className="h-7 px-2 text-xs text-slate-400 hover:text-red-600">
          {f.voidPurchase}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{f.voidPurchaseTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-slate-600">{f.voidPurchaseDesc}</p>
          <div className="space-y-2">
            <Label htmlFor={`void-${purchaseId}`}>{f.voidReason}</Label>
            <Input id={`void-${purchaseId}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
          <Button type="button" variant="destructive" disabled={loading || !reason.trim()} onClick={confirm}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {f.confirmVoid}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
