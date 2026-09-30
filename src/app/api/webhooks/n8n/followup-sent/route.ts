import { createOrgWebhookHandler } from "@/lib/org-webhook-route";
import { processFollowUpSentEvent } from "@/lib/webhook-processors";

export const POST = createOrgWebhookHandler({
  rateLimitKey: "followup-sent",
  source: "n8n",
  eventType: "followup.sent",
  process: processFollowUpSentEvent,
});
