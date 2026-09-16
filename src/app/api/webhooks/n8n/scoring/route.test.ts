// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const { POST } = await import("./route");

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/n8n/scoring", {
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

describe("POST /api/webhooks/n8n/scoring — per-organization secret isolation", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };
  let leadA: { id: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Webhook Scoring Org A");
    orgB = await createTestOrg("Webhook Scoring Org B");
    leadA = await prisma.lead.create({ data: { organizationId: orgA.id, name: "Score Target", source: "manual" } });
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("accepts a request signed with the target org's own secret", async () => {
    const body = JSON.stringify({ leadId: leadA.id, score: 75 });

    const res = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(200);

    const updated = await prisma.lead.findUniqueOrThrow({ where: { id: leadA.id } });
    expect(updated.score).toBe(75);
  });

  it("CRITICAL: rejects a request signed with org B's secret but targeting org A's lead", async () => {
    const body = JSON.stringify({ leadId: leadA.id, score: 1 });

    const res = await POST(
      makeRequest(body, { ...signed(body, orgB.n8nWebhookSecret), "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(401);

    const untouched = await prisma.lead.findUniqueOrThrow({ where: { id: leadA.id } });
    expect(untouched.score).toBe(75); // unchanged from the previous test, not forged to 1
  });

  it("CRITICAL: rejects a validly-signed request whose timestamp is outside the freshness window (replay)", async () => {
    const body = JSON.stringify({ leadId: leadA.id, score: 99 });
    const staleTimestamp = (Date.now() - 10 * 60 * 1000).toString();

    const res = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret, staleTimestamp), "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(401);

    const untouched = await prisma.lead.findUniqueOrThrow({ where: { id: leadA.id } });
    expect(untouched.score).toBe(75);
  });
});
