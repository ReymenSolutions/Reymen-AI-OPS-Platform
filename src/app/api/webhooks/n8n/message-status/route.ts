import { createOrgWebhookHandler } from "@/lib/org-webhook-route";
import { processMessageStatusEvent } from "@/lib/webhook-processors";

export const POST = createOrgWebhookHandler({
  rateLimitKey: "message-status",
  source: "n8n",
  eventType: "message.status",
  process: processMessageStatusEvent,
});
