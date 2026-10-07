"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { softDeleteSmartcardClientAction, reactivateSmartcardClientAction } from "@/actions/admin/smartcard-clients";

export function SmartcardClientDangerZone({ clientId, deleted }: { clientId: string; deleted: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm("¿Dar de baja a este cliente? Sus tarjetas dejan de redirigir. Se puede reactivar después.")) return;
    setBusy(true);
    const result = await softDeleteSmartcardClientAction(clientId);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Cliente dado de baja.");
    router.push("/admin/smartcard/clients");
  }

  async function handleReactivate() {
    setBusy(true);
    const result = await reactivateSmartcardClientAction(clientId);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Cliente reactivado.");
    router.refresh();
  }

  return (
    <Card className="border-red-100">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium text-slate-900">{deleted ? "Cliente dado de baja" : "Dar de baja"}</p>
          <p className="text-xs text-slate-500">
            {deleted
              ? "Sus tarjetas y perfiles no se borran, solo dejan de estar activos."
              : "No borra sus tarjetas ni perfiles — solo los desactiva. Solo super admin."}
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
