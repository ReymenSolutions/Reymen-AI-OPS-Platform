// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const { POST } = await import("./route");

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/n8n/leads", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/webhooks/n8n/leads — per-organization secret isolation", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Webhook Leads Org A");
    orgB = await createTestOrg("Webhook Leads Org B");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("accepts a request signed with the target org's own secret", async () => {
    const body = JSON.stringify({ name: "Legit Lead", source: "n8n" });
    const signature = createWebhookSignature(body, orgA.n8nWebhookSecret);

    const res = await POST(
      makeRequest(body, { "x-reymen-signature": signature, "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(200);

    const lead = await prisma.lead.findFirst({ where: { organizationId: orgA.id, name: "Legit Lead" } });
    expect(lead).not.toBeNull();
  });

  it("CRITICAL: rejects a request signed with org B's secret but targeting org A (cross-tenant forgery)", async () => {
    const body = JSON.stringify({ name: "Forged Lead", source: "n8n" });
    // Attacker knows org B's own secret (e.g. they operate org B's n8n workflow)
    // and tries to inject data into org A by just changing the orgId header.
    const signatureFromOrgB = createWebhookSignature(body, orgB.n8nWebhookSecret);

    const res = await POST(
      makeRequest(body, { "x-reymen-signature": signatureFromOrgB, "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(401);

    const forged = await prisma.lead.findFirst({ where: { organizationId: orgA.id, name: "Forged Lead" } });
    expect(forged).toBeNull();
  });

  it("rejects a request with a non-existent orgId", async () => {
    const body = JSON.stringify({ name: "Nowhere Lead", source: "n8n" });
    const signature = createWebhookSignature(body, "any-secret-since-org-does-not-exist");

    const res = await POST(
      makeRequest(body, { "x-reymen-signature": signature, "x-reymen-orgid": "does-not-exist" })
    );
    expect(res.status).toBe(401);
  });

  it("rejects a request with no orgId header at all", async () => {
    const body = JSON.stringify({ name: "No Org Lead", source: "n8n" });
    const res = await POST(makeRequest(body, { "x-reymen-signature": "sha256=whatever" }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with a tampered body even if the org id is correct", async () => {
    const originalBody = JSON.stringify({ name: "Original", source: "n8n" });
    const signature = createWebhookSignature(originalBody, orgA.n8nWebhookSecret);
    const tamperedBody = JSON.stringify({ name: "Tampered", source: "n8n" });

    const res = await POST(
      makeRequest(tamperedBody, { "x-reymen-signature": signature, "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(401);
  });
});
