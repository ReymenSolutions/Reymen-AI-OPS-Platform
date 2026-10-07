"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteSmartcardAdminUserAction } from "@/actions/admin/smartcard-users";
import type { SmartcardAdminRole } from "@/lib/smartcard-admin";

const ROLE_OPTIONS: { value: SmartcardAdminRole; label: string; hint: string }[] = [
  { value: "SUPERADMIN", label: "SUPERADMIN", hint: "acceso total, incluida baja de registros y gestión de usuarios" },
  { value: "ADMIN", label: "ADMIN", hint: "crea y edita, no borra ni gestiona usuarios" },
  { value: "VIEWER", label: "VIEWER", hint: "solo lectura" },
];

export function SmartcardInviteAdminForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SmartcardAdminRole>("ADMIN");

  async function handleSubmit() {
    if (!fullName.trim() || !email.trim()) {
      toast.error("El nombre y el correo son obligatorios.");
      return;
    }
    setSaving(true);
    const result = await inviteSmartcardAdminUserAction({ fullName, email, role });
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Invitación enviada.");
    router.push(`/admin/smartcard/users/${result.data.id}`);
    router.refresh();
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <p className="text-sm text-slate-500">
        Se manda un correo de invitación. La persona define su propia contraseña al abrir el link y confirma su cuenta en
        admin.reymen.mx.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-full-name">
          Nombre completo <span className="text-red-600">*</span>
        </Label>
        <Input id="invite-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">
          Correo <span className="text-red-600">*</span>
        </Label>
        <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-role">
          Rol <span className="text-red-600">*</span>
        </Label>
        <Select value={role} onValueChange={(v) => setRole(v as SmartcardAdminRole)}>
          <SelectTrigger id="invite-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label} — {o.hint}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving || !fullName.trim() || !email.trim()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Enviar invitación
        </Button>
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
