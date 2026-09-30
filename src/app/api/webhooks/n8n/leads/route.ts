import { createOrgWebhookHandler } from "@/lib/org-webhook-route";
import { processLeadEvent } from "@/lib/webhook-processors";

export const POST = createOrgWebhookHandler({
  rateLimitKey: "leads",
  source: "n8n",
  eventType: "lead.created",
  process: processLeadEvent,
});
