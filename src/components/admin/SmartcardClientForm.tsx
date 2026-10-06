"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSmartcardClientAction, updateSmartcardClientAction } from "@/actions/admin/smartcard-clients";
import type { SmartcardClientInput, SmartcardCompanyOption } from "@/lib/smartcard-admin";

/**
 * Formulario compartido entre /admin/smartcard/clients/new y
 * /admin/smartcard/clients/[clientId] — mismos campos que admin.reymen.mx
 * (apps/admin/app/clients/{new,[id]}/page.tsx), más el selector de empresa
 * multi-tenant (companyId) que ese panel nunca tuvo (se ligaba a mano por
 * SQL — ver smartcard-admin.ts).
 */

const NO_COMPANY = "__none__";

export function SmartcardClientForm({
  clientId,
  initial,
  companies,
}: {
  clientId?: string;
  initial?: SmartcardClientInput;
  companies: SmartcardCompanyOption[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SmartcardClientInput>(
    initial ?? {
      name: "",
      businessName: "",
      email: "",
      phone: "",
      notes: "",
      status: "ACTIVE",
      companyId: null,
    }
  );

  function set<K extends keyof SmartcardClientInput>(key: K, value: SmartcardClientInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    const result = clientId
      ? await updateSmartcardClientAction(clientId, form)
      : await createSmartcardClientAction(form);
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(clientId ? "Cliente actualizado." : "Cliente creado.");
    router.push(`/admin/smartcard/clients/${clientId ?? result.data!.id}`);
    router.refresh();
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-name">
          Nombre <span className="text-red-600">*</span>
        </Label>
        <Input id="client-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-business-name">Nombre del negocio</Label>
        <Input id="client-business-name" value={form.businessName ?? ""} onChange={(e) => set("businessName", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-email">Correo</Label>
        <Input id="client-email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-phone">Teléfono</Label>
        <Input id="client-phone" type="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-status">Estado</Label>
        <Select value={form.status} onValueChange={(v) => set("status", v as "ACTIVE" | "INACTIVE")}>
          <SelectTrigger id="client-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Activo</SelectItem>
            <SelectItem value="INACTIVE">Inactivo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-company">Empresa (multi-tenant)</Label>
        <Select
          value={form.companyId ?? NO_COMPANY}
          onValueChange={(v) => set("companyId", v === NO_COMPANY ? null : v)}
        >
          <SelectTrigger id="client-company">
            <SelectValue placeholder="Sin ligar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_COMPANY}>Sin ligar</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id} disabled={!!c.linkedClientId && c.linkedClientId !== clientId}>
                {c.name}
                {c.linkedClientId && c.linkedClientId !== clientId ? " (ya ligada a otro cliente)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">
          Necesaria para que el cliente tenga autoservicio en /portal/smartcard (estadísticas, editar destino, perfil
          digital). Una tarjeta de solo redirección simple no la necesita.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-notes">Notas internas</Label>
        <Textarea id="client-notes" rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        <p className="text-xs text-slate-500">Nunca se muestra en ningún perfil ni endpoint público.</p>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving || !form.name.trim()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar cliente
        </Button>
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
