"use client";

import { useState, useTransition } from "react";
import { Loader2, Layers, Check, Ban, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { setOrganizationModule, type ModuleEntitlementView } from "@/actions/admin/modules";
import type { ModuleSource, ModuleStatus, PlatformModule } from "@prisma/client";

const MODULE_LABEL: Record<PlatformModule, string> = {
  CRM: "CRM",
  AI_WHATSAPP: "Asistente IA / WhatsApp",
  AUTOMATIONS: "Automatizaciones",
  NFC_QR: "Smart Cards NFC/QR",
  MARKETING_ADS: "Marketing / Ads",
};

// NFC_QR and MARKETING_ADS are reserved for future modules — no functionality
// exists behind them yet, so they're shown but can't be toggled on here.
const RESERVED_MODULES: PlatformModule[] = ["NFC_QR", "MARKETING_ADS"];

const STATUS_BADGE: Record<ModuleStatus, { variant: "success" | "secondary" | "destructive"; icon: typeof Check; label: string }> = {
  ACTIVE: { variant: "success", icon: Check, label: "Activo" },
  SUSPENDED: { variant: "secondary", icon: Clock3, label: "Suspendido" },
  CANCELLED: { variant: "destructive", icon: Ban, label: "Cancelado" },
};

export function OrganizationModulesPanel({
  orgId,
  modules,
}: {
  orgId: string;
  modules: ModuleEntitlementView[];
}) {
  const [editing, setEditing] = useState<PlatformModule | null>(null);
  const [status, setStatus] = useState<ModuleStatus>("ACTIVE");
  const [source, setSource] = useState<ModuleSource>("SUBSCRIBED");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function openDialog(m: ModuleEntitlementView) {
    setEditing(m.module);
    setStatus(m.status ?? "ACTIVE");
    setSource(m.source ?? "ADMIN_GRANTED");
    setNotes(m.notes ?? "");
  }

  function handleSave() {
    if (!editing) return;
    startTransition(async () => {
      try {
        await setOrganizationModule({ orgId, module: editing, status, source, notes: notes || undefined });
        toast.success(`Módulo "${MODULE_LABEL[editing]}" actualizado`);
        setEditing(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al actualizar el módulo");
      }
    });
  }

  return (
    <>
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Módulos contratados</CardTitle>
          <Layers className="h-4 w-4 text-slate-400" />
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-slate-100">
            {modules.map((m) => {
              const reserved = RESERVED_MODULES.includes(m.module);
              const badge = m.status ? STATUS_BADGE[m.status] : null;
              return (
                <div key={m.module} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{MODULE_LABEL[m.module]}</p>
                    {reserved ? (
                      <p className="text-xs text-slate-400">Reservado — sin funcionalidad propia todavía</p>
                    ) : (
                      <p className="text-xs text-slate-400">
                        {m.source === "ADMIN_GRANTED" ? "Asignado por Reymen" : m.source === "SUBSCRIBED" ? "Suscrito" : "Sin habilitar"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {badge ? (
                      <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Sin habilitar</Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={reserved}
                      onClick={() => openDialog(m)}
                    >
                      Gestionar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? MODULE_LABEL[editing] : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</label>
              <div className="flex gap-2">
                {(["ACTIVE", "SUSPENDED", "CANCELLED"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`flex-1 rounded-md border-2 px-3 py-2 text-xs font-medium transition-colors ${
                      status === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {STATUS_BADGE[s].label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Origen</label>
              <div className="flex gap-2">
                {(["SUBSCRIBED", "ADMIN_GRANTED"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSource(s)}
                    className={`flex-1 rounded-md border-2 px-3 py-2 text-xs font-medium transition-colors ${
                      source === s ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {s === "SUBSCRIBED" ? "Suscrito (plan pago)" : "Asignado por Reymen"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="module-notes" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Notas internas (solo visible para admins)
              </label>
              <textarea
                id="module-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="Ej: cortesía de prueba por 30 días, suspendido por falta de pago…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
