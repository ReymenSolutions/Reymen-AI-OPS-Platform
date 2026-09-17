// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const { POST } = await import("./route");

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/n8n/followup-sent", {
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

describe("POST /api/webhooks/n8n/followup-sent", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Webhook FollowUpSent Org A");
    orgB = await createTestOrg("Webhook FollowUpSent Org B");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("accepts a request signed with the target org's own secret and logs the attempt", async () => {
    const lead = await prisma.lead.create({ data: { organizationId: orgA.id, name: "Route Test Lead" } });
    const rule = await prisma.followUpRule.create({
      data: { organizationId: orgA.id, name: "r", triggerStatus: "NEW", delayMinutes: 60, template: "hi" },
    });

    const body = JSON.stringify({ leadId: lead.id, ruleId: rule.id });
    const res = await POST(makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id }));
    expect(res.status).toBe(200);

    const count = await prisma.followUpLog.count({ where: { leadId: lead.id, ruleId: rule.id } });
    expect(count).toBe(1);
  });

  it("CRITICAL: rejects a request signed with org B's secret but targeting org A", async () => {
    const lead = await prisma.lead.create({ data: { organizationId: orgA.id, name: "Forged Route Test Lead" } });
    const rule = await prisma.followUpRule.create({
      data: { organizationId: orgA.id, name: "r", triggerStatus: "NEW", delayMinutes: 60, template: "hi" },
    });

    const body = JSON.stringify({ leadId: lead.id, ruleId: rule.id });
    const res = await POST(makeRequest(body, { ...signed(body, orgB.n8nWebhookSecret), "x-reymen-orgid": orgA.id }));
    expect(res.status).toBe(401);

    const count = await prisma.followUpLog.count({ where: { leadId: lead.id, ruleId: rule.id } });
    expect(count).toBe(0);
  });

  it("idempotency: resending the same event id does not double-process", async () => {
    const lead = await prisma.lead.create({ data: { organizationId: orgA.id, name: "Dedup Route Test Lead" } });
    const rule = await prisma.followUpRule.create({
      data: { organizationId: orgA.id, name: "r", triggerStatus: "NEW", delayMinutes: 60, template: "hi" },
    });

    const body = JSON.stringify({ leadId: lead.id, ruleId: rule.id });
    const headers = { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id, "x-reymen-event-id": "evt-followup-a" };

    const first = await POST(makeRequest(body, headers));
    expect(first.status).toBe(200);
    const second = await POST(makeRequest(body, headers));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });

    const count = await prisma.followUpLog.count({ where: { leadId: lead.id, ruleId: rule.id } });
    expect(count).toBe(1);
  });
});
