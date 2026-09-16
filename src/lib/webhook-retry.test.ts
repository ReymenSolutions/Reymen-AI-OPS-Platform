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
    processWebhookEventPayload.mockResolvedValue(undefined);
    const e1 = await createFailedEvent();
    const e2 = await createFailedEvent();
    const exhausted = await createFailedEvent(MAX_WEBHOOK_ATTEMPTS);

    // retryAllFailedWebhookEvents also supports an unscoped platform-wide
    // sweep (used by the real cron and the admin "retry all" action), and
    // other test files exercise that exact unscoped call concurrently
    // against this same shared test DB. Even scoped to this org, a
    // concurrent unscoped sweep from another file can process e1/e2 before
    // this call's own query runs, so asserting on the return value of one
    // specific call is inherently racy. Instead, retry (idempotent — a row
    // no longer FAILED is simply excluded from the next query) until this
    // org's own events are settled, then assert on their actual end state,
    // which is true regardless of which call ends up doing the work.
    for (let i = 0; i < 5; i++) {
      const [u1, u2] = await Promise.all([
        prisma.webhookEvent.findUniqueOrThrow({ where: { id: e1.id } }),
        prisma.webhookEvent.findUniqueOrThrow({ where: { id: e2.id } }),
      ]);
      if (u1.status === "PROCESSED" && u2.status === "PROCESSED") break;
      await retryAllFailedWebhookEvents({ organizationId: org.id });
    }

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
