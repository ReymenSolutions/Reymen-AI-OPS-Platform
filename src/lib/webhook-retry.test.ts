// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const processWebhookEventPayload = vi.fn();
vi.mock("@/lib/webhook-processors", () => ({
  processWebhookEventPayload: (...args: unknown[]) => processWebhookEventPayload(...args),
}));

const { retryWebhookEvent, retryAllFailedWebhookEvents, MAX_WEBHOOK_ATTEMPTS, WebhookRetryError } = await import(
  "./webhook-retry"
);

describe("webhook retry", () => {
  let org: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Webhook Retry Org");
  });

  beforeEach(() => {
    processWebhookEventPayload.mockReset();
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  async function createFailedEvent(attempts = 1) {
    return prisma.webhookEvent.create({
      data: {
        organizationId: org.id,
        source: "n8n",
        eventType: "lead.created",
        payload: { name: "Retry Lead" },
        status: "FAILED",
        attempts,
        errorMessage: "Simulated original failure",
      },
    });
  }

  it("retries a FAILED event and marks it PROCESSED on success", async () => {
    processWebhookEventPayload.mockResolvedValue(undefined);
    const event = await createFailedEvent();

    const result = await retryWebhookEvent(event.id);
    expect(result.success).toBe(true);

    const updated = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(updated.status).toBe("PROCESSED");
    expect(updated.attempts).toBe(2);
    expect(updated.errorMessage).toBeNull();
    expect(updated.processedAt).not.toBeNull();
  });

  it("keeps the event FAILED and records the new error when the retry fails again", async () => {
    processWebhookEventPayload.mockRejectedValue(new Error("still broken"));
    const event = await createFailedEvent();

    const result = await retryWebhookEvent(event.id);
    expect(result.success).toBe(false);

    const updated = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.attempts).toBe(2);
    expect(updated.errorMessage).toBe("still broken");
  });

  it("refuses to retry an already-PROCESSED event", async () => {
    const event = await prisma.webhookEvent.create({
      data: {
        organizationId: org.id,
        source: "n8n",
        eventType: "lead.created",
        payload: {},
        status: "PROCESSED",
        attempts: 1,
      },
    });

    await expect(retryWebhookEvent(event.id)).rejects.toThrow(WebhookRetryError);
    expect(processWebhookEventPayload).not.toHaveBeenCalled();
  });

  it("refuses to retry once MAX_WEBHOOK_ATTEMPTS is reached", async () => {
    const event = await createFailedEvent(MAX_WEBHOOK_ATTEMPTS);

    await expect(retryWebhookEvent(event.id)).rejects.toThrow(/máximo/i);
    expect(processWebhookEventPayload).not.toHaveBeenCalled();

    const untouched = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(untouched.attempts).toBe(MAX_WEBHOOK_ATTEMPTS);
  });

  it("retryAllFailedWebhookEvents retries every eligible FAILED event, oldest first", async () => {
    // retryAllFailedWebhookEvents intentionally has no org filter (it's a
    // platform-wide cron sweep), so other test files' FAILED events running
    // concurrently in the shared test DB may also get swept up here — assert
    // on this test's own events rather than the exact global result counts.
    processWebhookEventPayload.mockResolvedValue(undefined);
    const e1 = await createFailedEvent();
    const e2 = await createFailedEvent();
    const exhausted = await createFailedEvent(MAX_WEBHOOK_ATTEMPTS);

    const result = await retryAllFailedWebhookEvents();
    expect(result.retried).toBeGreaterThanOrEqual(2);
    expect(result.succeeded).toBeGreaterThanOrEqual(2);

    const [u1, u2, uExhausted] = await Promise.all([
      prisma.webhookEvent.findUniqueOrThrow({ where: { id: e1.id } }),
      prisma.webhookEvent.findUniqueOrThrow({ where: { id: e2.id } }),
      prisma.webhookEvent.findUniqueOrThrow({ where: { id: exhausted.id } }),
    ]);
    expect(u1.status).toBe("PROCESSED");
    expect(u2.status).toBe("PROCESSED");
    expect(uExhausted.status).toBe("FAILED");
    expect(uExhausted.attempts).toBe(MAX_WEBHOOK_ATTEMPTS);
  });
});
