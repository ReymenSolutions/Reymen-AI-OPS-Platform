"use client";

import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { previewPosSalesPurgeAction, purgePosSalesAction } from "@/actions/admin/food-purge";
import type { PosSalesPurgeSummary } from "@/lib/food-purge";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

const COPY = {
  es: {
    title: "Borrar ventas de prueba del POS",
    intro:
      "Borra por completo las ventas que llegaron de Reymen POS en un rango de días: regresa el inventario que descontaron y quita sus platillos vendidos. Las ventas capturadas a mano no se tocan. No se puede deshacer.",
    from: "Desde",
    to: "Hasta",
    review: "Revisar",
    none: "No hay ventas del POS en esas fechas.",
    found: (s: PosSalesPurgeSummary, money: string) =>
      `${s.sales} ${s.sales === 1 ? "venta" : "ventas"} · ${money} · ${s.units} platillos · ${s.inventoryItems} insumos regresan al inventario`,
    span: "Primera y última",
    delete: (n: number) => `Borrar ${n} ${n === 1 ? "venta" : "ventas"}`,
    confirmTitle: "Confirmar borrado",
    confirmText: "Escribe BORRAR para confirmar. Esta acción no se puede deshacer y queda registrada en la bitácora.",
    cancel: "Cancelar",
    confirm: "Borrar definitivamente",
    done: (n: number) => `Se borraron ${n} ventas de prueba`,
    error: "No se pudo completar",
    posNote: "Las ventas siguen guardadas en las tablets y cajas del POS (pantalla Ventas y cortes); en Reymen ya no cuentan.",
  },
  en: {
    title: "Delete POS test sales",
    intro:
      "Fully deletes the sales that came from Reymen POS in a date range: returns the inventory they used and removes their dishes sold. Manually entered sales are not touched. This can't be undone.",
    from: "From",
    to: "To",
    review: "Review",
    none: "No POS sales on those dates.",
    found: (s: PosSalesPurgeSummary, money: string) =>
      `${s.sales} ${s.sales === 1 ? "sale" : "sales"} · ${money} · ${s.units} dishes · ${s.inventoryItems} inventory items restored`,
    span: "First and last",
    delete: (n: number) => `Delete ${n} ${n === 1 ? "sale" : "sales"}`,
    confirmTitle: "Confirm deletion",
    confirmText: "Type BORRAR to confirm. This can't be undone and is recorded in the audit log.",
    cancel: "Cancel",
    confirm: "Delete permanently",
    done: (n: number) => `${n} test sales deleted`,
    error: "Couldn't complete",
    posNote: "The sales are still stored on the POS tablets and registers (Sales screen and cash reports); they no longer count in Reymen.",
  },
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function PurgePosSalesPanel({ orgId }: { orgId: string }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState<PosSalesPurgeSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const money = (n: number) => n.toLocaleString(lang === "en" ? "en-US" : "es-MX", { style: "currency", currency: "MXN" });
  const when = (iso: string) => new Date(iso).toLocaleString(lang === "en" ? "en-US" : "es-MX", { dateStyle: "short", timeStyle: "short" });

  function review() {
    startTransition(async () => {
      try {
        setSummary(await previewPosSalesPurgeAction({ orgId, from, to }));
      } catch (e) {
        setSummary(null);
        toast.error(getErrorMessage(e, t.error));
      }
    });
  }

  function purge() {
    startTransition(async () => {
      try {
        const result = await purgePosSalesAction({ orgId, from, to, confirm: typed });
        toast.success(t.done(result.sales));
        setOpen(false);
        setTyped("");
        setSummary(null);
      } catch (e) {
        toast.error(getErrorMessage(e, t.error));
      }
    });
  }

  return (
    <Card className="lg:col-span-2 border-red-100">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t.title}</CardTitle>
        <Trash2 className="h-4 w-4 text-red-400" />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-500">{t.intro}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="purge-from">{t.from}</Label>
            <Input id="purge-from" type="date" value={from} max={to} onChange={(e) => (setFrom(e.target.value), setSummary(null))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="purge-to">{t.to}</Label>
            <Input id="purge-to" type="date" value={to} min={from} onChange={(e) => (setTo(e.target.value), setSummary(null))} />
          </div>
          <Button variant="outline" onClick={review} disabled={pending || !from || !to}>
            {pending && !open ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t.review}
          </Button>
        </div>
        {summary && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            {summary.sales === 0 ? (
              <p className="text-slate-600">{t.none}</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-900">{t.found(summary, money(summary.grossAmount))}</p>
                  {summary.firstAt && summary.lastAt && (
                    <p className="text-xs text-slate-500">
                      {t.span}: {when(summary.firstAt)} – {when(summary.lastAt)}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">{t.posNote}</p>
                </div>
                <Button variant="destructive" onClick={() => setOpen(true)} disabled={pending}>
                  {t.delete(summary.sales)}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !o && (setOpen(false), setTyped(""))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.confirmTitle}</DialogTitle>
          </DialogHeader>
          {summary && <p className="text-sm font-medium text-slate-900">{t.found(summary, money(summary.grossAmount))}</p>}
          <p className="text-sm text-slate-600">{t.confirmText}</p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="BORRAR" autoComplete="off" aria-label="BORRAR" />
          <DialogFooter>
            <Button variant="outline" onClick={() => (setOpen(false), setTyped(""))} disabled={pending}>
              {t.cancel}
            </Button>
            <Button variant="destructive" onClick={purge} disabled={pending || typed !== "BORRAR"}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
