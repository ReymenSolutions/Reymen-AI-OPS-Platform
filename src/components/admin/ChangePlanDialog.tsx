"use client";

import { useState } from "react";
import { Loader2, CreditCard, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { changePlan } from "@/actions/admin/clients";
import { PLAN_LIMITS, PLAN_MODULES } from "@/lib/permissions";
import { MODULE_LABEL } from "@/lib/modules";

interface ChangePlanDialogProps {
  orgId: string;
  currentPlan: string;
}

const PLANS = [
  {
    key: "starter",
    price: "$299 USD/mes",
    color: "border-slate-200",
    badge: "bg-slate-100 text-slate-700",
  },
  {
    key: "professional",
    price: "$699 USD/mes",
    color: "border-brand-300",
    badge: "bg-brand-100 text-brand-700",
  },
  {
    key: "enterprise",
    price: "Personalizado",
    color: "border-amber-300",
    badge: "bg-amber-100 text-amber-700",
  },
];

export function ChangePlanDialog({ orgId, currentPlan }: ChangePlanDialogProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentPlan);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (selected === currentPlan) { setOpen(false); return; }
    setLoading(true);
    try {
      await changePlan(orgId, selected);
      toast.success(`Plan actualizado a ${PLAN_LIMITS[selected]?.label ?? selected}`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cambiar plan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CreditCard className="h-4 w-4" />
          Cambiar plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar plan del cliente</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {PLANS.map((plan) => {
            const limits = PLAN_LIMITS[plan.key];
            const isSelected = selected === plan.key;
            return (
              <button
                key={plan.key}
                onClick={() => setSelected(plan.key)}
                className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
                  isSelected ? `${plan.color} bg-slate-50` : "border-slate-100 hover:border-slate-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${plan.badge}`}>
                      {limits?.label}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{plan.price}</span>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-brand-600" />}
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                  <span>{limits?.leads.toLocaleString("en-US")} leads</span>
                  <span>{limits?.users === 99 ? "Ilimitado" : limits?.users} usuarios</span>
                  <span>{limits?.automations === 99 ? "Ilimitadas" : limits?.automations} automatizaciones</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  Incluye: {(PLAN_MODULES[plan.key] ?? []).map((m) => MODULE_LABEL[m]).join(", ")}
                </p>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading || selected === currentPlan}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
