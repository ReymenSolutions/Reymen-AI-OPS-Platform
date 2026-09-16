import { prisma } from "./prisma";
import { processWebhookEventPayload } from "./webhook-processors";

export const MAX_WEBHOOK_ATTEMPTS = 5;

export class WebhookRetryError extends Error {}

/**
 * Re-runs a previously FAILED WebhookEvent's processing logic in place.
 * Refuses to retry an event that's already PROCESSED, or one that's
 * exhausted MAX_WEBHOOK_ATTEMPTS (surfaced to the admin UI/cron caller
 * as a reason rather than silently no-op'ing).
 */
export async function retryWebhookEvent(eventId: string): Promise<{ success: boolean }> {
  const event = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });

  if (event.status === "PROCESSED") {
    throw new WebhookRetryError("Este evento ya fue procesado exitosamente");
  }
  if (event.attempts >= MAX_WEBHOOK_ATTEMPTS) {
    throw new WebhookRetryError(`Se alcanzó el máximo de ${MAX_WEBHOOK_ATTEMPTS} intentos`);
  }

  await prisma.webhookEvent.update({
    where: { id: eventId },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });

  try {
    await processWebhookEventPayload(event.eventType, event.payload, event.organizationId);

    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { status: "PROCESSED", processedAt: new Date(), errorMessage: null },
    });

    return { success: true };
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    return { success: false };
  }
}

/**
 * Retries every FAILED event still under the attempt cap, oldest first.
 * Used by the admin "retry all" action and the scheduled retry cron — both
 * call this with no `organizationId`, sweeping every organization's backlog
 * together (intentional: this is a platform-wide reliability sweep, not a
 * per-tenant one). `organizationId` exists so a narrower sweep is possible
 * (e.g. clearing one org's backlog specifically) without a second code path.
 */
export async function retryAllFailedWebhookEvents(
  options: { limit?: number; organizationId?: string } = {}
): Promise<{ retried: number; succeeded: number }> {
  const { limit = 50, organizationId } = options;
  const events = await prisma.webhookEvent.findMany({
    where: {
      status: "FAILED",
      attempts: { lt: MAX_WEBHOOK_ATTEMPTS },
      ...(organizationId ? { organizationId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let succeeded = 0;
  for (const event of events) {
    const result = await retryWebhookEvent(event.id);
    if (result.success) succeeded++;
  }

  return { retried: events.length, succeeded };
}
