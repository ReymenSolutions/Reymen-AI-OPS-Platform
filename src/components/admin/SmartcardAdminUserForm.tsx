"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  updateSmartcardAdminUserAction,
  deactivateSmartcardAdminUserAction,
  reactivateSmartcardAdminUserAction,
} from "@/actions/admin/smartcard-users";
import type { SmartcardAdminRole } from "@/lib/smartcard-admin";

const ROLE_OPTIONS: SmartcardAdminRole[] = ["SUPERADMIN", "ADMIN", "VIEWER"];

/**
 * isSelf se calcula comparando correos, no ids: quien ve esta pantalla está
 * autenticado en este panel (sesión de app.reymen.mx), no en el Supabase
 * Auth del proyecto de SmartCard, así que su id de sesión nunca va a
 * coincidir con el id de una fila de admin_profiles aunque sea la misma
 * persona. El correo es la única señal en común entre los dos sistemas.
 */
export function SmartcardAdminUserForm({
  userId,
  initialFullName,
  initialRole,
  initialIsActive,
  email,
  viewerEmail,
}: {
  userId: string;
  initialFullName: string;
  initialRole: SmartcardAdminRole;
  initialIsActive: boolean;
  email: string | null;
  viewerEmail: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState(initialFullName);
  const [role, setRole] = useState<SmartcardAdminRole>(initialRole);
  const [isActive, setIsActive] = useState(initialIsActive);

  const isSelf = !!email && !!viewerEmail && email.toLowerCase() === viewerEmail.toLowerCase();

  async function handleSave() {
    if (!fullName.trim()) {
      toast.error("El nombre completo es obligatorio.");
      return;
    }
    setSaving(true);
    const result = await updateSmartcardAdminUserAction(userId, { fullName, role });
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Cambios guardados.");
    router.refresh();
  }

  async function handleDeactivate() {
    setSaving(true);
    const result = await deactivateSmartcardAdminUserAction(userId);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setIsActive(false);
    toast.success("Cuenta desactivada.");
    router.refresh();
  }

  async function handleReactivate() {
    setSaving(true);
    const result = await reactivateSmartcardAdminUserAction(userId);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setIsActive(true);
    toast.success("Cuenta reactivada.");
    router.refresh();
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      {!isActive && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <p>Esta cuenta está desactivada. No puede iniciar sesión en admin.reymen.mx.</p>
          {!isSelf && (
            <Button size="sm" variant="ghost" className="mt-1 h-auto p-0 underline" disabled={saving} onClick={handleReactivate}>
              Reactivar cuenta
            </Button>
          )}
        </div>
      )}

      {isSelf && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Este correo coincide con el tuyo — no puedes cambiarle el rol ni desactivarlo desde aquí. Pídele a otro super
          admin que lo haga.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="user-full-name">
          Nombre completo <span className="text-red-600">*</span>
        </Label>
        <Input id="user-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={isSelf} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="user-role">Rol</Label>
        <Select value={role} onValueChange={(v) => setRole(v as SmartcardAdminRole)} disabled={isSelf}>
          <SelectTrigger id="user-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving || !fullName.trim() || isSelf}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar cambios
        </Button>
      </div>

      {isActive && !isSelf && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <Button variant="ghost" size="sm" className="h-auto p-0 text-red-600 underline" disabled={saving} onClick={handleDeactivate}>
            Desactivar esta cuenta
          </Button>
        </div>
      )}
    </div>
  );
}
