// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const { POST } = await import("./route");

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/n8n/conversations", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/webhooks/n8n/conversations — per-organization secret isolation", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Webhook Conv Org A");
    orgB = await createTestOrg("Webhook Conv Org B");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("accepts a request signed with the target org's own secret", async () => {
    const body = JSON.stringify({
      contactPhone: "+15551234567",
      channel: "whatsapp",
      message: { role: "USER", content: "hola" },
    });
    const signature = createWebhookSignature(body, orgA.n8nWebhookSecret);

    const res = await POST(
      makeRequest(body, { "x-reymen-signature": signature, "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(200);

    const conv = await prisma.conversation.findFirst({ where: { organizationId: orgA.id } });
    expect(conv).not.toBeNull();
  });

  it("CRITICAL: rejects a request signed with org B's secret but targeting org A", async () => {
    const body = JSON.stringify({
      contactPhone: "+15559999999",
      channel: "whatsapp",
      message: { role: "USER", content: "forged message" },
    });
    const signatureFromOrgB = createWebhookSignature(body, orgB.n8nWebhookSecret);

    const res = await POST(
      makeRequest(body, { "x-reymen-signature": signatureFromOrgB, "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(401);

    const forged = await prisma.conversation.findFirst({
      where: { organizationId: orgA.id, contactPhone: "+15559999999" },
    });
    expect(forged).toBeNull();
  });

  it("rejects a request with no orgId header", async () => {
    const body = JSON.stringify({ contactPhone: "+1", channel: "whatsapp", message: { role: "USER", content: "x" } });
    const res = await POST(makeRequest(body, { "x-reymen-signature": "sha256=whatever" }));
    expect(res.status).toBe(401);
  });
});
