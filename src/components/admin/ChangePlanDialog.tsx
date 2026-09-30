"use client";

import { useState } from "react";
import { Loader2, CreditCard, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { changePlan } from "@/actions/admin/clients";
import { PLAN_LIMITS, PLAN_MODULES, PLAN_PRICES, hasCustomPrice, isUnlimited } from "@/lib/permissions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getModuleLabel } from "@/lib/modules";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

interface ChangePlanDialogProps {
  orgId: string;
  currentPlan: string;
  /** Precio pactado actual (USD/mes) si el plan es personalizado. */
  currentCustomPrice: number | null;
}

const PLANS = [
  {
    key: "starter",
    color: "border-slate-200",
    badge: "bg-slate-100 text-slate-700",
  },
  {
    key: "professional",
    color: "border-brand-300",
    badge: "bg-brand-100 text-brand-700",
  },
  {
    key: "enterprise",
    color: "border-amber-300",
    badge: "bg-amber-100 text-amber-700",
  },
];

export function ChangePlanDialog({ orgId, currentPlan, currentCustomPrice }: ChangePlanDialogProps) {
  const { lang } = usePreferences();
  const MODULE_LABEL = getModuleLabel(lang);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentPlan);
  const [customPrice, setCustomPrice] = useState(currentCustomPrice !== null ? String(currentCustomPrice) : "");
  const needsCustomPrice = hasCustomPrice(selected);
  const parsedCustomPrice = customPrice.trim() === "" ? null : Number(customPrice);
  const customPriceInvalid = needsCustomPrice && parsedCustomPrice !== null && !(Number.isFinite(parsedCustomPrice) && parsedCustomPrice > 0);
  const unchanged = selected === currentPlan && (!needsCustomPrice || parsedCustomPrice === currentCustomPrice);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (unchanged) { setOpen(false); return; }
    setLoading(true);
    try {
      await changePlan(orgId, selected, needsCustomPrice ? parsedCustomPrice : null);
      toast.success(lang === "es" ? `Plan actualizado a ${PLAN_LIMITS[selected]?.label ?? selected}` : `Plan updated to ${PLAN_LIMITS[selected]?.label ?? selected}`);
      setOpen(false);
    } catch (e) {
      toast.error(getErrorMessage(e, (lang === "es" ? "Error al cambiar plan" : "Error changing plan")));
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
            // Mismo precio que usa el ROI (PLAN_PRICES), no una copia propia.
            const fixedPrice = PLAN_PRICES[plan.key];
            const price = fixedPrice === null || fixedPrice === undefined
              ? (lang === "es" ? "Precio personalizado" : "Custom price")
              : `$${fixedPrice.toLocaleString("en-US")} USD/${lang === "es" ? "mes" : "mo"}`;
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
                  <span>{limits && isUnlimited(limits.leads) ? (lang === "es" ? "Leads ilimitados" : "Unlimited leads") : `${limits?.leads.toLocaleString("en-US")} leads`}</span>
                  <span>{limits && isUnlimited(limits.users) ? (lang === "es" ? "Usuarios ilimitados" : "Unlimited users") : `${limits?.users} ${lang === "es" ? "usuarios" : "users"}`}</span>
                  <span>{limits && isUnlimited(limits.automations) ? (lang === "es" ? "Automatizaciones ilimitadas" : "Unlimited automations") : `${limits?.automations} ${lang === "es" ? "automatizaciones" : "automations"}`}</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  {lang === "es" ? "Incluye" : "Includes"}: {(PLAN_MODULES[plan.key] ?? []).map((m) => MODULE_LABEL[m]).join(", ")}
                </p>
              </button>
            );
          })}
        </div>

        {needsCustomPrice && (
          <div className="space-y-1.5">
            <Label htmlFor="customPrice">{lang === "es" ? "Precio mensual pactado (USD)" : "Agreed monthly price (USD)"}</Label>
            <Input
              id="customPrice"
              type="number"
              min="0"
              step="0.01"
              placeholder={lang === "es" ? "Ej. 1500" : "E.g. 1500"}
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              {customPriceInvalid
                ? (lang === "es" ? "Debe ser un monto mayor a 0." : "Must be an amount greater than 0.")
                : (lang === "es" ? "Se usa para el ROI del cliente. Puedes dejarlo vacío mientras se cierra la cotización." : "Used for the client's ROI. You can leave it empty while the quote is being closed.")}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{lang === "es" ? "Cancelar" : "Cancel"}</Button>
          <Button onClick={handleSave} disabled={loading || unchanged || customPriceInvalid}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {lang === "es" ? "Guardar" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
