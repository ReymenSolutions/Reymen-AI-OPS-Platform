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
import { getModuleLabel } from "@/lib/modules";
import { usePreferences } from "@/context/preferences";

interface ChangePlanDialogProps {
  orgId: string;
  currentPlan: string;
}

const PLANS = [
  {
    key: "starter",
    price: "$299 USD/mo",
    color: "border-slate-200",
    badge: "bg-slate-100 text-slate-700",
  },
  {
    key: "professional",
    price: "$699 USD/mo",
    color: "border-brand-300",
    badge: "bg-brand-100 text-brand-700",
  },
  {
    key: "enterprise",
    price: "custom",
    color: "border-amber-300",
    badge: "bg-amber-100 text-amber-700",
  },
];

export function ChangePlanDialog({ orgId, currentPlan }: ChangePlanDialogProps) {
  const { lang } = usePreferences();
  const MODULE_LABEL = getModuleLabel(lang);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentPlan);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (selected === currentPlan) { setOpen(false); return; }
    setLoading(true);
    try {
      await changePlan(orgId, selected);
      toast.success(lang === "es" ? `Plan actualizado a ${PLAN_LIMITS[selected]?.label ?? selected}` : `Plan updated to ${PLAN_LIMITS[selected]?.label ?? selected}`);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al cambiar plan" : "Error changing plan"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CreditCard className="h-4 w-4" />
          {lang === "es" ? "Cambiar plan" : "Change plan"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lang === "es" ? "Cambiar plan del cliente" : "Change client's plan"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {PLANS.map((plan) => {
            const limits = PLAN_LIMITS[plan.key];
            const isSelected = selected === plan.key;
            const price = plan.key === "enterprise" ? (lang === "es" ? "Personalizado" : "Custom") : (lang === "es" ? plan.price.replace("/mo", "/mes") : plan.price);
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
                    <span className="text-sm font-medium text-slate-900">{price}</span>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-brand-600" />}
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                  <span>{limits?.leads.toLocaleString("en-US")} leads</span>
                  <span>{limits?.users === 99 ? (lang === "es" ? "Ilimitado" : "Unlimited") : limits?.users} {lang === "es" ? "usuarios" : "users"}</span>
                  <span>{limits?.automations === 99 ? (lang === "es" ? "Ilimitadas" : "Unlimited") : limits?.automations} {lang === "es" ? "automatizaciones" : "automations"}</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  {lang === "es" ? "Incluye" : "Includes"}: {(PLAN_MODULES[plan.key] ?? []).map((m) => MODULE_LABEL[m]).join(", ")}
                </p>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
          <Button onClick={handleSave} disabled={loading || selected === currentPlan}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {lang === "es" ? "Guardar" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
