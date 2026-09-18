"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCheckoutSession, createBillingPortalSession } from "@/actions/billing";
import { usePreferences } from "@/context/preferences";

interface BillingActionsProps {
  hasActiveSubscription: boolean;
}

export function BillingActions({ hasActiveSubscription }: BillingActionsProps) {
  const { lang } = usePreferences();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handleUpgrade(plan: "professional" | "enterprise") {
    setLoadingPlan(plan);
    try {
      const { url } = await createCheckoutSession(plan);
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al iniciar el pago" : "Error starting payment"));
      setLoadingPlan(null);
    }
  }

  async function handleManageBilling() {
    setLoadingPlan("portal");
    try {
      const { url } = await createBillingPortalSession();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === "es" ? "Error al abrir la facturación" : "Error opening billing"));
      setLoadingPlan(null);
    }
  }

  if (hasActiveSubscription) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={handleManageBilling} disabled={loadingPlan === "portal"}>
        {loadingPlan === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        {lang === "es" ? "Gestionar facturación" : "Manage billing"}
      </Button>
    );
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={() => handleUpgrade("professional")}
        disabled={loadingPlan !== null}
      >
        {loadingPlan === "professional" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {lang === "es" ? "Actualizar a Professional" : "Upgrade to Professional"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={() => handleUpgrade("enterprise")}
        disabled={loadingPlan !== null}
      >
        {loadingPlan === "enterprise" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {lang === "es" ? "Actualizar a Enterprise" : "Upgrade to Enterprise"}
      </Button>
    </div>
  );
}
