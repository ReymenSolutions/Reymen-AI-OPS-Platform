"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { softDeleteSmartcardProfileAction, reactivateSmartcardProfileAction } from "@/actions/admin/smartcard-profiles";

export function SmartcardProfileDangerZone({ profileId, deleted }: { profileId: string; deleted: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm("¿Dar de baja este perfil? Su link público deja de funcionar hasta que se reactive.")) return;
    setBusy(true);
    const result = await softDeleteSmartcardProfileAction(profileId);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Perfil dado de baja.");
    router.push("/admin/smartcard/profiles");
  }

  async function handleReactivate() {
    setBusy(true);
    const result = await reactivateSmartcardProfileAction(profileId);
    setBusy(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Perfil reactivado.");
    router.refresh();
  }

  return (
    <Card className="border-red-100">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium text-slate-900">{deleted ? "Perfil dado de baja" : "Dar de baja"}</p>
          <p className="text-xs text-slate-500">
            {deleted ? "Su link público deja de funcionar hasta que se reactive." : "No borra el perfil ni sus links — solo lo desactiva. Solo super admin."}
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
