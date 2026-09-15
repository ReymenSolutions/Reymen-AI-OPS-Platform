"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { retryWebhookEventAction } from "@/actions/admin/webhook-events";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";

export function RetryWebhookEventButton({ eventId, disabled }: { eventId: string; disabled?: boolean }) {
  const { t } = usePreferences();
  const [loading, setLoading] = useState(false);

  async function handleRetry() {
    setLoading(true);
    try {
      const result = await retryWebhookEventAction(eventId);
      if (result.success) {
        toast.success(t.adminWebhooksRetrySuccess);
      } else {
        toast.error(t.adminWebhooksRetryFailed);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleRetry}
      disabled={disabled || loading}
      className="h-7 px-2 text-xs"
    >
      <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
      {loading ? t.adminWebhooksRetrying : t.adminWebhooksRetry}
    </Button>
  );
}
