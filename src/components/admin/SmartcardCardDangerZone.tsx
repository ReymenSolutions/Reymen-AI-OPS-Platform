"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { softDeleteSmartcardCardAction, reactivateSmartcardCardAction } from "@/actions/admin/smartcard-cards";

export function SmartcardCardDangerZone({ cardId, deleted }: { cardId: string; deleted: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm("¿Dar de baja esta tarjeta? Deja de redirigir hasta que se reactive.")) return;
    setBusy(true);
    const result = await softDeleteSmartcardCardAction(cardId);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Tarjeta dada de baja.");
    router.push("/admin/smartcard/cards");
  }

  async function handleReactivate() {
    setBusy(true);
    const result = await reactivateSmartcardCardAction(cardId);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Tarjeta reactivada.");
    router.refresh();
  }

  return (
    <Card className="border-red-100">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium text-slate-900">{deleted ? "Tarjeta dada de baja" : "Dar de baja"}</p>
          <p className="text-xs text-slate-500">
            {deleted
              ? "Deja de redirigir hasta que se reactive."
              : "No borra la tarjeta — solo deja de redirigir. Solo super admin."}
          </p>
        </div>
        <Button variant={deleted ? "outline" : "destructive"} size="sm" disabled={busy} onClick={deleted ? handleReactivate : handleDelete}>
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {deleted ? "Reactivar" : "Dar de baja"}
        </Button>
      </CardContent>
    </Card>
  );
}
