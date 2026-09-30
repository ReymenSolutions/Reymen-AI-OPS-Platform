import { createOrgWebhookHandler } from "@/lib/org-webhook-route";
import { processConversationEvent } from "@/lib/webhook-processors";

export const POST = createOrgWebhookHandler({
  rateLimitKey: "conversations",
  source: "n8n",
  eventType: "conversation.message",
  process: processConversationEvent,
  successBody: (result) => ({ conversationId: result.conversationId }),
});
