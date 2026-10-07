"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateSmartcardCompanyAction } from "@/actions/admin/smartcard-companies";
import type { SmartcardCompanyAdminInput } from "@/lib/smartcard-admin";

const STATUS_OPTIONS = [
  { value: "trial", label: "Prueba" },
  { value: "active", label: "Activa" },
  { value: "past_due", label: "Pago vencido" },
  { value: "suspended", label: "Suspendida" },
  { value: "cancelled", label: "Cancelada" },
];

/**
 * Edita una company de SmartCard — mismos campos que admin.reymen.mx's
 * apps/admin/app/companies/[id]/page.tsx (updateCompanyAction). No hay
 * selector de cliente/organización aquí: el vínculo SSO
 * (companies.external_org_id) es de solo lectura en esta pantalla, se
 * cambia desde el detalle de la Organization en /admin/clients/[id] (ver
 * el comentario de smartcard-admin.ts).
 */
export function SmartcardCompanyForm({ companyId, initial }: { companyId: string; initial: SmartcardCompanyAdminInput }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SmartcardCompanyAdminInput>(initial);

  function set<K extends keyof SmartcardCompanyAdminInput>(key: K, value: SmartcardCompanyAdminInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    if (!form.slug.trim()) {
      toast.error("El slug es obligatorio.");
      return;
    }
    setSaving(true);
    const result = await updateSmartcardCompanyAction(companyId, form);
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Cambios guardados.");
    router.refresh();
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-name">
          Nombre <span className="text-red-600">*</span>
        </Label>
        <Input id="company-name" value={form.name} onChange={(e) => set("name", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-slug">
          Slug <span className="text-red-600">*</span>
        </Label>
        <Input id="company-slug" value={form.slug} onChange={(e) => set("slug", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-industry">Industria</Label>
        <Input id="company-industry" value={form.industry ?? ""} onChange={(e) => set("industry", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-billing-email">Correo de facturación</Label>
        <Input
          id="company-billing-email"
          type="email"
          value={form.billingEmail ?? ""}
          onChange={(e) => set("billingEmail", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-timezone">Zona horaria</Label>
        <Input id="company-timezone" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="company-status">Estado</Label>
        <Select value={form.status} onValueChange={(v) => set("status", v)}>
          <SelectTrigger id="company-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving || !form.name.trim() || !form.slug.trim()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </div>
  );
}
