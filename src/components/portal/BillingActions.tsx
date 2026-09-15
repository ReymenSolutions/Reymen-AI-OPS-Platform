"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createCheckoutSession, createBillingPortalSession } from "@/actions/billing";

interface BillingActionsProps {
  hasActiveSubscription: boolean;
}

export function BillingActions({ hasActiveSubscription }: BillingActionsProps) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handleUpgrade(plan: "professional" | "enterprise") {
    setLoadingPlan(plan);
    try {
      const { url } = await createCheckoutSession(plan);
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al iniciar el pago");
      setLoadingPlan(null);
    }
  }

  async function handleManageBilling() {
    setLoadingPlan("portal");
    try {
      const { url } = await createBillingPortalSession();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al abrir la facturación");
      setLoadingPlan(null);
    }
  }

  if (hasActiveSubscription) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={handleManageBilling} disabled={loadingPlan === "portal"}>
        {loadingPlan === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        Gestionar facturación
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
        Actualizar a Professional
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="flex-1"
        onClick={() => handleUpgrade("enterprise")}
        disabled={loadingPlan !== null}
      >
        {loadingPlan === "enterprise" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Actualizar a Enterprise
      </Button>
    </div>
  );
}
