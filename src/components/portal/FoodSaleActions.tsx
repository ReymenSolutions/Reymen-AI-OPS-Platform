"use client";

import { useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { deleteFoodSale, updateFoodSale } from "@/actions/food";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

export interface EditableSale {
  id: string;
  /** "YYYY-MM-DDTHH:mm" en la hora del negocio, lista para el input. */
  occurredAt: string;
  channel: string | null;
  grossAmount: number;
  netAmount: number;
  notes: string | null;
}

/** Editar o borrar una venta capturada a mano (las del POS no llegan aquí). */
export function FoodSaleActions({ sale }: { sale: EditableSale }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<"save" | "delete" | null>(null);
  const [form, setForm] = useState(() => toForm(sale));

  function toForm(s: EditableSale) {
    return { occurredAt: s.occurredAt, channel: s.channel ?? "", grossAmount: String(s.grossAmount), netAmount: String(s.netAmount), notes: s.notes ?? "" };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading("save");
    try {
      await updateFoodSale(sale.id, {
        occurredAt: form.occurredAt,
        channel: form.channel || undefined,
        grossAmount: Number(form.grossAmount),
        netAmount: Number(form.netAmount),
        notes: form.notes || undefined,
      });
      toast.success(es ? "Venta actualizada" : "Sale updated");
      setOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, es ? "Error al guardar" : "Error saving"));
    } finally {
      setLoading(null);
    }
  }

  async function remove() {
    if (!window.confirm(es ? "¿Borrar esta venta? Se quitará de los totales." : "Delete this sale? It will be removed from the totals.")) return;
    setLoading("delete");
    try {
      await deleteFoodSale(sale.id);
      toast.success(es ? "Venta borrada" : "Sale deleted");
    } catch (err) {
      toast.error(getErrorMessage(err, "Error"));
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => { setForm(toForm(sale)); setOpen(true); }}
        className="h-7 w-7 p-0 text-slate-400 hover:text-brand-600"
        title={es ? "Editar" : "Edit"}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={remove}
        disabled={loading !== null}
        className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
        title={es ? "Borrar" : "Delete"}
      >
        {loading === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{es ? "Editar venta" : "Edit sale"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor={`sale-date-${sale.id}`}>{es ? "Fecha" : "Date"}</Label>
              <Input id={`sale-date-${sale.id}`} type="datetime-local" required value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`sale-channel-${sale.id}`}>{es ? "Canal" : "Channel"}</Label>
              <Input id={`sale-channel-${sale.id}`} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`sale-gross-${sale.id}`}>{es ? "Bruto" : "Gross"}</Label>
                <Input id={`sale-gross-${sale.id}`} type="number" step="0.01" min="0" required value={form.grossAmount} onChange={(e) => setForm({ ...form, grossAmount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`sale-net-${sale.id}`}>{es ? "Neto (sin IVA)" : "Net (before tax)"}</Label>
                <Input id={`sale-net-${sale.id}`} type="number" step="0.01" min="0" required value={form.netAmount} onChange={(e) => setForm({ ...form, netAmount: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`sale-notes-${sale.id}`}>{es ? "Notas" : "Notes"}</Label>
              <Textarea id={`sale-notes-${sale.id}`} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{es ? "Cancelar" : "Cancel"}</Button>
              <Button type="submit" disabled={loading !== null}>
                {loading === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
                {es ? "Guardar" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
