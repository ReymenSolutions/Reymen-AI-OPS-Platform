// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg, generateWebhookSecret } from "@/test/helpers";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));

const {
  processLeadEvent,
  processConversationEvent,
  processScoringEvent,
  processAutomationEvent,
  processMessageStatusEvent,
  processWebhookEventPayload,
} = await import("./webhook-processors");

describe("webhook processors", () => {
  let org: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Webhook Processors Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "professional" } });
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("processLeadEvent creates a lead scoped to the org", async () => {
    await processLeadEvent({ name: "Processed Lead", source: "n8n" }, org.id);
    const lead = await prisma.lead.findFirst({ where: { organizationId: org.id, name: "Processed Lead" } });
    expect(lead).not.toBeNull();
  });

  it("processLeadEvent rejects a payload with no name", async () => {
    await expect(processLeadEvent({}, org.id)).rejects.toThrow(/missing lead name/i);
  });

  it("CRITICAL: processLeadEvent is idempotent by externalId — replaying the same payload does not create a second lead", async () => {
    const payload = { name: "Dedup Lead", source: "n8n", externalId: "crm-dedup-1" };
    await processLeadEvent(payload, org.id);
    await processLeadEvent(payload, org.id); // simulates a retried delivery
    await processLeadEvent(payload, org.id); // and a third, for good measure

    const count = await prisma.lead.count({ where: { organizationId: org.id, externalId: "crm-dedup-1" } });
    expect(count).toBe(1);
  });

  it("without an externalId, processLeadEvent has no way to dedup and creates a lead every time (documented limitation)", async () => {
    const payload = { name: "No External Id Lead", source: "n8n" };
    await processLeadEvent(payload, org.id);
    await processLeadEvent(payload, org.id);

    const count = await prisma.lead.count({ where: { organizationId: org.id, name: "No External Id Lead" } });
    expect(count).toBe(2);
  });

  it("CRITICAL: concurrent deliveries with the same externalId still result in exactly one lead (race, not just sequential retry)", async () => {
    const payload = { name: "Race Lead", source: "n8n", externalId: "crm-race-1" };
    await Promise.all([processLeadEvent(payload, org.id), processLeadEvent(payload, org.id)]);

    const count = await prisma.lead.count({ where: { organizationId: org.id, externalId: "crm-race-1" } });
    expect(count).toBe(1);
  });

  it("processConversationEvent creates a conversation and message, returning the conversation id", async () => {
    const result = await processConversationEvent(
      {
        contactPhone: "+15551234567",
        contactName: "New Contact",
        channel: "whatsapp",
        message: { role: "USER", content: "Hola" },
      },
      org.id
    );

    const conv = await prisma.conversation.findUniqueOrThrow({
      where: { id: result.conversationId },
      include: { messages: true },
    });
    expect(conv.organizationId).toBe(org.id);
    expect(conv.messages).toHaveLength(1);
  });

  it("CRITICAL: processConversationEvent is idempotent by message externalId — replaying doesn't append the message twice", async () => {
    const payload = {
      contactPhone: "+15557778888",
      contactName: "Dedup Contact",
      channel: "whatsapp",
      message: { role: "USER" as const, content: "Mensaje repetido", externalId: "wa-dedup-1" },
    };

    const first = await processConversationEvent(payload, org.id);
    await processConversationEvent(payload, org.id); // same conversation resolved by contactPhone, same message externalId

    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: first.conversationId }, include: { messages: true } });
    expect(conv.messages.filter((m) => m.externalId === "wa-dedup-1")).toHaveLength(1);
  });

  it("processScoringEvent updates the lead's score", async () => {
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Score Me", source: "manual" } });
    await processScoringEvent({ leadId: lead.id, score: 87, reason: "high intent" }, org.id);
    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updated.score).toBe(87);
    expect(updated.scoreReason).toBe("high intent");
  });

  it("processScoringEvent rejects an out-of-range score", async () => {
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Bad Score", source: "manual" } });
    await expect(processScoringEvent({ leadId: lead.id, score: 150 }, org.id)).rejects.toThrow(/between 0 and 100/i);
  });

  it("processAutomationEvent logs the event and marks the automation ERROR on failure", async () => {
    const admin = await createTestUser(null, "SUPER_ADMIN", "processor-admin");
    const automation = await prisma.automation.create({
      data: { organizationId: org.id, name: "Test Automation", type: "custom", webhookSecret: generateWebhookSecret() },
    });

    await processAutomationEvent(
      { automationId: automation.id, type: "run", status: "FAILED", errorMessage: "boom" },
      org.id
    );

    const updated = await prisma.automation.findUniqueOrThrow({ where: { id: automation.id } });
    expect(updated.status).toBe("ERROR");

    const event = await prisma.automationEvent.findFirst({ where: { automationId: automation.id } });
    expect(event?.status).toBe("FAILED");

    await prisma.automationEvent.deleteMany({ where: { automationId: automation.id } });
    await prisma.automation.delete({ where: { id: automation.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it("processWebhookEventPayload dispatches to the right processor by eventType", async () => {
    await processWebhookEventPayload("lead.created", { name: "Dispatched Lead" }, org.id);
    const lead = await prisma.lead.findFirst({ where: { organizationId: org.id, name: "Dispatched Lead" } });
    expect(lead).not.toBeNull();
  });

  it("processWebhookEventPayload rejects an unknown eventType", async () => {
    await expect(processWebhookEventPayload("something.unknown", {}, org.id)).rejects.toThrow(/unknown webhook/i);
  });

  describe("processMessageStatusEvent", () => {
    it("updates deliveryStatus on the referenced message", async () => {
      const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp" } });
      const msg = await prisma.message.create({
        data: { conversationId: conv.id, role: "AGENT", content: "hola", deliveryStatus: "PENDING" },
      });

      await processMessageStatusEvent({ messageId: msg.id, status: "DELIVERED" }, org.id);

      const updated = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
      expect(updated.deliveryStatus).toBe("DELIVERED");
    });

    it("stores the error message in metadata on a FAILED status", async () => {
      const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp" } });
      const msg = await prisma.message.create({
        data: { conversationId: conv.id, role: "AGENT", content: "hola", deliveryStatus: "PENDING" },
      });

      await processMessageStatusEvent({ messageId: msg.id, status: "FAILED", errorMessage: "número inválido" }, org.id);

      const updated = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
      expect(updated.deliveryStatus).toBe("FAILED");
      expect((updated.metadata as { deliveryError?: string })?.deliveryError).toBe("número inválido");
    });

    it("rejects a messageId belonging to another organization", async () => {
      const otherOrg = await createTestOrg("Message Status Other Org");
      const conv = await prisma.conversation.create({ data: { organizationId: otherOrg.id, channel: "whatsapp" } });
      const msg = await prisma.message.create({
        data: { conversationId: conv.id, role: "AGENT", content: "hola", deliveryStatus: "PENDING" },
      });

      await expect(processMessageStatusEvent({ messageId: msg.id, status: "DELIVERED" }, org.id)).rejects.toThrow(/not found/i);

      await cleanupOrg(otherOrg.id);
    });
  });
});
