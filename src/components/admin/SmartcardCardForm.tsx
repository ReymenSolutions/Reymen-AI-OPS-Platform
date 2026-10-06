"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSmartcardCardAction, updateSmartcardCardAction } from "@/actions/admin/smartcard-cards";
import type {
  SmartcardCardInput,
  SmartcardClientOption,
  SmartcardProfileOption,
} from "@/lib/smartcard-admin";
import type { DestinationTypeOption } from "@/lib/smartcard-company";

/**
 * Formulario compartido entre /admin/smartcard/cards/new y
 * /admin/smartcard/cards/[cardId] — mismos campos que admin.reymen.mx
 * (apps/admin/app/cards/{new,[id]}/page.tsx + CardDestinationFields.tsx),
 * reescrito con los componentes de este panel (Select de shadcn en vez de
 * <select> nativo) pero con la misma regla: el tipo de destino decide si se
 * pide perfil, URL, o ninguno — nunca ambos a la vez.
 *
 * card_code NO es un campo de este formulario — lo genera un trigger de
 * Postgres al crear la tarjeta (ver smartcard-admin.ts) y nunca se puede
 * editar después; se muestra aparte, en la página de detalle.
 */
export function SmartcardCardForm({
  cardId,
  initial,
  clients,
  destinationTypes,
  profiles,
  lockClient,
}: {
  cardId?: string;
  initial?: SmartcardCardInput;
  clients: SmartcardClientOption[];
  destinationTypes: DestinationTypeOption[];
  profiles: SmartcardProfileOption[];
  /** true cuando la tarjeta ya viene de /clients/[id] con ?clientId= fijo. */
  lockClient?: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SmartcardCardInput>(
    initial ?? {
      clientId: "",
      destinationType: destinationTypes[0]?.code ?? "",
      profileId: null,
      destinationUrl: "",
      notes: "",
      status: "ACTIVE",
    }
  );

  function set<K extends keyof SmartcardCardInput>(key: K, value: SmartcardCardInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const selectedType = useMemo(
    () => destinationTypes.find((d) => d.code === form.destinationType),
    [destinationTypes, form.destinationType]
  );
  const needsProfile = selectedType?.requiresProfile ?? false;
  const needsUrl = selectedType?.requiresUrl ?? false;

  async function handleSubmit() {
    if (!form.clientId) {
      toast.error("El cliente es obligatorio.");
      return;
    }
    if (!form.destinationType) {
      toast.error("El tipo de destino es obligatorio.");
      return;
    }
    setSaving(true);
    const result = cardId ? await updateSmartcardCardAction(cardId, form) : await createSmartcardCardAction(form);
    setSaving(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(cardId ? "Tarjeta actualizada." : "Tarjeta creada.");
    router.push(`/admin/smartcard/cards/${cardId ?? result.data!.id}`);
    router.refresh();
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="card-client">
          Cliente <span className="text-red-600">*</span>
        </Label>
        <Select value={form.clientId} onValueChange={(v) => set("clientId", v)} disabled={!!lockClient}>
          <SelectTrigger id="card-client">
            <SelectValue placeholder="Selecciona un cliente..." />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="card-destination-type">
          Tipo de destino <span className="text-red-600">*</span>
        </Label>
        <Select value={form.destinationType} onValueChange={(v) => set("destinationType", v)}>
          <SelectTrigger id="card-destination-type">
            <SelectValue placeholder="Selecciona un tipo..." />
          </SelectTrigger>
          <SelectContent>
            {destinationTypes.map((d) => (
              <SelectItem key={d.code} value={d.code}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsProfile && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="card-profile">
            Perfil digital <span className="text-red-600">*</span>
          </Label>
          <Select value={form.profileId ?? ""} onValueChange={(v) => set("profileId", v || null)}>
            <SelectTrigger id="card-profile">
              <SelectValue placeholder="Selecciona un perfil..." />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.displayName} — {p.clientName ?? "?"} (/{p.slug})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {needsUrl && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="card-destination-url">
            URL de destino <span className="text-red-600">*</span>
          </Label>
          <Input
            id="card-destination-url"
            type="url"
            placeholder="https://..."
            value={form.destinationUrl ?? ""}
            onChange={(e) => set("destinationUrl", e.target.value)}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="card-status">Estado</Label>
        <Select value={form.status} onValueChange={(v) => set("status", v as "ACTIVE" | "INACTIVE")}>
          <SelectTrigger id="card-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Activa</SelectItem>
            <SelectItem value="INACTIVE">Inactiva</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="card-notes">Notas internas</Label>
        <Textarea id="card-notes" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving || !form.clientId || !form.destinationType}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar tarjeta
        </Button>
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
