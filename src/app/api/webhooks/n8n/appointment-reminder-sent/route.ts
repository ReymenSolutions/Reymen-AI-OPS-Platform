import { createOrgWebhookHandler } from "@/lib/org-webhook-route";
import { processAppointmentReminderSentEvent } from "@/lib/webhook-processors";

export const POST = createOrgWebhookHandler({
  rateLimitKey: "appointment-reminder-sent",
  source: "n8n",
  eventType: "appointment_reminder.sent",
  process: processAppointmentReminderSentEvent,
});
