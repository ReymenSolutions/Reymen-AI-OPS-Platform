// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const { POST } = await import("./route");

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/n8n/message-status", {
    method: "POST",
    headers,
    body,
  });
}

function signed(body: string, secret: string, timestamp = Date.now().toString()) {
  return {
    "x-reymen-signature": createWebhookSignature(body, secret, timestamp),
    "x-reymen-timestamp": timestamp,
  };
}

describe("POST /api/webhooks/n8n/message-status", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Webhook MsgStatus Org A");
    orgB = await createTestOrg("Webhook MsgStatus Org B");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("accepts a request signed with the target org's own secret and updates the message", async () => {
    const conv = await prisma.conversation.create({ data: { organizationId: orgA.id, channel: "whatsapp" } });
    const msg = await prisma.message.create({
      data: { conversationId: conv.id, role: "AGENT", content: "hola", deliveryStatus: "PENDING" },
    });

    const body = JSON.stringify({ messageId: msg.id, status: "SENT" });
    const res = await POST(makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id }));
    expect(res.status).toBe(200);

    const updated = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
    expect(updated.deliveryStatus).toBe("SENT");
  });

  it("CRITICAL: rejects a request signed with org B's secret but targeting org A", async () => {
    const conv = await prisma.conversation.create({ data: { organizationId: orgA.id, channel: "whatsapp" } });
    const msg = await prisma.message.create({
      data: { conversationId: conv.id, role: "AGENT", content: "hola", deliveryStatus: "PENDING" },
    });

    const body = JSON.stringify({ messageId: msg.id, status: "DELIVERED" });
    const res = await POST(makeRequest(body, { ...signed(body, orgB.n8nWebhookSecret), "x-reymen-orgid": orgA.id }));
    expect(res.status).toBe(401);

    const stillPending = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
    expect(stillPending.deliveryStatus).toBe("PENDING");
  });

  it("returns 500 (processing failed) for a messageId that doesn't exist in that org", async () => {
    const body = JSON.stringify({ messageId: "does-not-exist", status: "SENT" });
    const res = await POST(makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id }));
    expect(res.status).toBe(500);
  });

  it("idempotency: resending the same event id doesn't double-process", async () => {
    const conv = await prisma.conversation.create({ data: { organizationId: orgA.id, channel: "whatsapp" } });
    const msg = await prisma.message.create({
      data: { conversationId: conv.id, role: "AGENT", content: "hola", deliveryStatus: "PENDING" },
    });

    const body = JSON.stringify({ messageId: msg.id, status: "READ" });
    const headers = { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id, "x-reymen-event-id": "evt-status-a" };

    const first = await POST(makeRequest(body, headers));
    expect(first.status).toBe(200);
    const second = await POST(makeRequest(body, headers));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });
  });
});
