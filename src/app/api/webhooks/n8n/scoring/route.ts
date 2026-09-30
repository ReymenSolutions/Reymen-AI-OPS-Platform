import { createOrgWebhookHandler } from "@/lib/org-webhook-route";
import { processScoringEvent } from "@/lib/webhook-processors";

export const POST = createOrgWebhookHandler({
  rateLimitKey: "scoring",
  source: "n8n",
  eventType: "lead.scored",
  process: processScoringEvent,
});
