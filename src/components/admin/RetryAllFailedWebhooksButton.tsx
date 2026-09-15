"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { retryAllFailedWebhookEventsAction } from "@/actions/admin/webhook-events";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";

export function RetryAllFailedWebhooksButton({ disabled }: { disabled?: boolean }) {
  const { t, lang } = usePreferences();
  const [loading, setLoading] = useState(false);

  async function handleRetryAll() {
    setLoading(true);
    try {
      const result = await retryAllFailedWebhookEventsAction();
      const suffix = lang === "es" ? "reprocesados con éxito" : "reprocessed successfully";
      toast.success(`${result.succeeded}/${result.retried} ${suffix}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleRetryAll} disabled={disabled || loading}>
      <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
      {loading ? t.adminWebhooksRetrying : t.adminWebhooksRetryAll}
    </Button>
  );
}
