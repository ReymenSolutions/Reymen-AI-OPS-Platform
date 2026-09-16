// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ingestWebhookEvent } from "@/lib/webhook-ingest";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

describe("ingestWebhookEvent", () => {
  let org: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Webhook Ingest Org");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("records a WebhookEvent and marks it PROCESSED when the processor succeeds", async () => {
    const process = vi.fn().mockResolvedValue({ ok: true });
    const result = await ingestWebhookEvent(
      { organizationId: org.id, source: "n8n", eventType: "lead.created", payload: { a: 1 }, externalEventId: "evt-1" },
      process
    );

    expect(result).toEqual({ outcome: "processed", result: { ok: true } });
    expect(process).toHaveBeenCalledOnce();

    const event = await prisma.webhookEvent.findUniqueOrThrow({
      where: { organizationId_source_externalEventId: { organizationId: org.id, source: "n8n", externalEventId: "evt-1" } },
    });
    expect(event.status).toBe("PROCESSED");
    expect(event.processedAt).not.toBeNull();
  });

  it("marks the WebhookEvent FAILED and returns 'failed' when the processor throws", async () => {
    const process = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await ingestWebhookEvent(
      { organizationId: org.id, source: "n8n", eventType: "lead.created", payload: {}, externalEventId: "evt-fail-1" },
      process
    );

    expect(result).toEqual({ outcome: "failed", error: "boom" });

    const event = await prisma.webhookEvent.findUniqueOrThrow({
      where: { organizationId_source_externalEventId: { organizationId: org.id, source: "n8n", externalEventId: "evt-fail-1" } },
    });
    expect(event.status).toBe("FAILED");
    expect(event.errorMessage).toBe("boom");
  });

  it("CRITICAL: a repeated externalEventId short-circuits as a duplicate without calling the processor again", async () => {
    const process = vi.fn().mockResolvedValue({ ok: true });
    const params = { organizationId: org.id, source: "n8n", eventType: "lead.created", payload: {}, externalEventId: "evt-dup-1" };

    await ingestWebhookEvent(params, process);
    const second = await ingestWebhookEvent(params, process);

    expect(second).toEqual({ outcome: "duplicate" });
    expect(process).toHaveBeenCalledOnce(); // not called on the second delivery

    const count = await prisma.webhookEvent.count({
      where: { organizationId: org.id, source: "n8n", externalEventId: "evt-dup-1" },
    });
    expect(count).toBe(1);
  });

  it("CRITICAL: two concurrent deliveries with the same externalEventId still process exactly once (race, not just sequential)", async () => {
    const process = vi.fn().mockResolvedValue({ ok: true });
    const params = { organizationId: org.id, source: "n8n", eventType: "lead.created", payload: {}, externalEventId: "evt-race-1" };

    const [a, b] = await Promise.all([ingestWebhookEvent(params, process), ingestWebhookEvent(params, process)]);

    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual(["duplicate", "processed"]);
    expect(process).toHaveBeenCalledOnce();

    const count = await prisma.webhookEvent.count({
      where: { organizationId: org.id, source: "n8n", externalEventId: "evt-race-1" },
    });
    expect(count).toBe(1);
  });

  it("without an externalEventId, every delivery is processed and recorded separately (no dedup possible)", async () => {
    const process = vi.fn().mockResolvedValue({ ok: true });
    const params = { organizationId: org.id, source: "n8n", eventType: "lead.created", payload: {}, externalEventId: null };

    await ingestWebhookEvent(params, process);
    await ingestWebhookEvent(params, process);

    expect(process).toHaveBeenCalledTimes(2);
  });
});
