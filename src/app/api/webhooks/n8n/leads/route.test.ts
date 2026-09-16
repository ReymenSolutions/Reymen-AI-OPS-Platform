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

/** Signs `body` with a fresh timestamp and returns both headers, ready to spread into makeRequest. */
function signed(body: string, secret: string, timestamp = Date.now().toString()) {
  return {
    "x-reymen-signature": createWebhookSignature(body, secret, timestamp),
    "x-reymen-timestamp": timestamp,
  };
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

    const res = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(200);

    const lead = await prisma.lead.findFirst({ where: { organizationId: orgA.id, name: "Legit Lead" } });
    expect(lead).not.toBeNull();
  });

  it("CRITICAL: rejects a request signed with org B's secret but targeting org A (cross-tenant forgery)", async () => {
    const body = JSON.stringify({ name: "Forged Lead", source: "n8n" });
    // Attacker knows org B's own secret (e.g. they operate org B's n8n workflow)
    // and tries to inject data into org A by just changing the orgId header.
    const res = await POST(
      makeRequest(body, { ...signed(body, orgB.n8nWebhookSecret), "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(401);

    const forged = await prisma.lead.findFirst({ where: { organizationId: orgA.id, name: "Forged Lead" } });
    expect(forged).toBeNull();
  });

  it("rejects a request with a non-existent orgId", async () => {
    const body = JSON.stringify({ name: "Nowhere Lead", source: "n8n" });
    const res = await POST(
      makeRequest(body, { ...signed(body, "any-secret-since-org-does-not-exist"), "x-reymen-orgid": "does-not-exist" })
    );
    expect(res.status).toBe(401);
  });

  it("rejects a request with no orgId header at all", async () => {
    const body = JSON.stringify({ name: "No Org Lead", source: "n8n" });
    const res = await POST(makeRequest(body, { "x-reymen-signature": "sha256=whatever", "x-reymen-timestamp": Date.now().toString() }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with a tampered body even if the org id is correct", async () => {
    const originalBody = JSON.stringify({ name: "Original", source: "n8n" });
    const headers = signed(originalBody, orgA.n8nWebhookSecret);
    const tamperedBody = JSON.stringify({ name: "Tampered", source: "n8n" });

    const res = await POST(makeRequest(tamperedBody, { ...headers, "x-reymen-orgid": orgA.id }));
    expect(res.status).toBe(401);
  });

  it("CRITICAL: rejects a validly-signed request whose timestamp is outside the freshness window (replay)", async () => {
    const body = JSON.stringify({ name: "Replayed Lead", source: "n8n" });
    const staleTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes old
    const res = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret, staleTimestamp), "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(401);

    const replayed = await prisma.lead.findFirst({ where: { organizationId: orgA.id, name: "Replayed Lead" } });
    expect(replayed).toBeNull();
  });

  it("idempotency: resending the same delivery (same x-reymen-event-id) does not create a second lead", async () => {
    const body = JSON.stringify({ name: "Idempotent Lead", source: "n8n" });
    const eventId = "evt-idempotent-lead-1";

    const first = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id, "x-reymen-event-id": eventId })
    );
    expect(first.status).toBe(200);

    const second = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id, "x-reymen-event-id": eventId })
    );
    expect(second.status).toBe(200);
    expect((await second.json()).duplicate).toBe(true);

    const count = await prisma.lead.count({ where: { organizationId: orgA.id, name: "Idempotent Lead" } });
    expect(count).toBe(1);
  });

  it("idempotency: resending the same lead externalId (even under a different event id) does not create a second lead", async () => {
    const body = JSON.stringify({ name: "Stable External Lead", source: "n8n", externalId: "crm-lead-777" });

    const first = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id, "x-reymen-event-id": "evt-a" })
    );
    expect(first.status).toBe(200);

    // Different delivery/event id, but the same underlying lead — n8n's own
    // retry logic re-sent the whole HTTP request with a fresh execution ID.
    const second = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id, "x-reymen-event-id": "evt-b" })
    );
    expect(second.status).toBe(200);

    const count = await prisma.lead.count({ where: { organizationId: orgA.id, externalId: "crm-lead-777" } });
    expect(count).toBe(1);
  });
});
