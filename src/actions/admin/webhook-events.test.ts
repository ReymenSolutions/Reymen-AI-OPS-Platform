// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN",
}));

vi.mock("@/lib/webhook-processors", () => ({
  processWebhookEventPayload: vi.fn().mockResolvedValue(undefined),
}));

const { retryWebhookEventAction, retryAllFailedWebhookEventsAction } = await import("./webhook-events");

describe("admin webhook events actions", () => {
  let org: { id: string };
  let admin: { id: string };
  let owner: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Webhook Events Actions Org");
    admin = await createTestUser(null, "ADMIN", "wh-admin");
    owner = await createTestUser(org.id, "OWNER", "wh-owner");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it("rejects a non-admin caller", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await expect(retryWebhookEventAction("whatever")).rejects.toThrow(/no autorizado/i);
    await expect(retryAllFailedWebhookEventsAction()).rejects.toThrow(/no autorizado/i);
  });

  it("lets an admin retry a specific failed event", async () => {
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "ADMIN", organizationId: null }));
    const event = await prisma.webhookEvent.create({
      data: {
        organizationId: org.id,
        source: "n8n",
        eventType: "lead.created",
        payload: {},
        status: "FAILED",
        attempts: 1,
      },
    });

    const result = await retryWebhookEventAction(event.id);
    expect(result.success).toBe(true);

    const updated = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(updated.status).toBe("PROCESSED");
  });

  it("lets an admin retry all failed events at once", async () => {
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "ADMIN", organizationId: null }));
    await prisma.webhookEvent.create({
      data: {
        organizationId: org.id,
        source: "n8n",
        eventType: "lead.created",
        payload: {},
        status: "FAILED",
        attempts: 1,
      },
    });

    const result = await retryAllFailedWebhookEventsAction();
    expect(result.retried).toBeGreaterThan(0);
  });
});
