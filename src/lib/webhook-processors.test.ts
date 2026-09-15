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
});
