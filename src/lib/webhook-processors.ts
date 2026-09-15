import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { notifyAdmins } from "./admin-notifications";
import { automationFailureEmail } from "./email-templates";
import { assertPlanCapacity } from "./plan-limits";

/**
 * Processing logic for each n8n webhook event type, shared between the
 * originating route (which authenticates + rate-limits the request) and
 * the retry path (which re-runs a previously FAILED WebhookEvent by id,
 * already authenticated by virtue of having been accepted the first time).
 */

export async function processLeadEvent(payload: unknown, orgId: string): Promise<void> {
  const body = payload as {
    name: string;
    email?: string;
    phone?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.name) throw new Error("Missing lead name");

  const org = await prisma.organization.findUnique({ where: { id: orgId, isActive: true } });
  if (!org) throw new Error("Organization not found");

  await assertPlanCapacity(orgId, "leads");

  await prisma.lead.create({
    data: {
      organizationId: orgId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      source: body.source ?? "n8n",
      metadata: (body.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

export async function processConversationEvent(payload: unknown, orgId: string): Promise<{ conversationId: string }> {
  const body = payload as {
    conversationId?: string;
    contactPhone: string;
    contactName?: string;
    channel: string;
    message: { role: "USER" | "ASSISTANT" | "SYSTEM"; content: string };
  };

  let conversation = body.conversationId
    ? await prisma.conversation.findFirst({
        where: { id: body.conversationId, organizationId: orgId },
      })
    : await prisma.conversation.findFirst({
        where: { organizationId: orgId, contactPhone: body.contactPhone, status: "OPEN" },
      });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        organizationId: orgId,
        channel: body.channel,
        contactPhone: body.contactPhone,
        contactName: body.contactName,
      },
    });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: body.message.role,
      content: body.message.content,
    },
  });

  return { conversationId: conversation.id };
}

export async function processScoringEvent(payload: unknown, orgId: string): Promise<void> {
  const body = payload as { leadId: string; score: number; reason?: string };

  if (body.score < 0 || body.score > 100) {
    throw new Error("Score must be between 0 and 100");
  }

  const lead = await prisma.lead.findFirst({
    where: { id: body.leadId, organizationId: orgId, deletedAt: null },
  });
  if (!lead) throw new Error("Lead not found");

  await prisma.lead.update({
    where: { id: body.leadId },
    data: { score: Math.round(body.score), scoreReason: body.reason },
  });
}

export async function processAutomationEvent(payload: unknown, orgId: string): Promise<void> {
  const body = payload as {
    automationId: string;
    type: string;
    status: "SUCCESS" | "FAILED" | "PENDING";
    payload?: Record<string, unknown>;
    errorMessage?: string;
    duration?: number;
  };

  await prisma.automationEvent.create({
    data: {
      automationId: body.automationId,
      organizationId: orgId,
      type: body.type,
      status: body.status,
      payload: (body.payload as Prisma.InputJsonValue) ?? undefined,
      errorMessage: body.errorMessage,
      duration: body.duration,
    },
  });

  if (body.status === "FAILED") {
    const automation = await prisma.automation.update({
      where: { id: body.automationId },
      data: { status: "ERROR" },
      include: { organization: { select: { name: true } } },
    });

    const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/automations`;
    const email = automationFailureEmail(automation.organization.name, automation.name, adminUrl);
    await notifyAdmins(email);
  }
}

export type WebhookEventType = "lead.created" | "conversation.message" | "lead.scored" | "automation.event";

/** Dispatches a stored WebhookEvent's payload to the processor matching its eventType. */
export async function processWebhookEventPayload(
  eventType: string,
  payload: unknown,
  orgId: string
): Promise<void> {
  switch (eventType as WebhookEventType) {
    case "lead.created":
      return processLeadEvent(payload, orgId);
    case "conversation.message":
      await processConversationEvent(payload, orgId);
      return;
    case "lead.scored":
      return processScoringEvent(payload, orgId);
    case "automation.event":
      return processAutomationEvent(payload, orgId);
    default:
      throw new Error(`Unknown webhook event type: ${eventType}`);
  }
}
