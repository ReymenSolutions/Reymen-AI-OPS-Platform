// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const { POST } = await import("./route");

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/n8n/appointment-reminder-sent", {
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

describe("POST /api/webhooks/n8n/appointment-reminder-sent", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Webhook ReminderSent Org A");
    orgB = await createTestOrg("Webhook ReminderSent Org B");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("accepts a request signed with the target org's own secret and logs the reminder", async () => {
    const apt = await prisma.appointment.create({
      data: { organizationId: orgA.id, title: "Route Test", startTime: new Date(), endTime: new Date(Date.now() + 30 * 60 * 1000) },
    });
    const rule = await prisma.appointmentReminderRule.create({ data: { organizationId: orgA.id, offsetMinutes: 60, template: "hi" } });

    const body = JSON.stringify({ appointmentId: apt.id, ruleId: rule.id });
    const res = await POST(makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id }));
    expect(res.status).toBe(200);

    const log = await prisma.appointmentReminderLog.findUnique({
      where: { appointmentId_ruleId: { appointmentId: apt.id, ruleId: rule.id } },
    });
    expect(log).not.toBeNull();
  });

  it("CRITICAL: rejects a request signed with org B's secret but targeting org A", async () => {
    const apt = await prisma.appointment.create({
      data: { organizationId: orgA.id, title: "Forged Route Test", startTime: new Date(), endTime: new Date(Date.now() + 30 * 60 * 1000) },
    });
    const rule = await prisma.appointmentReminderRule.create({ data: { organizationId: orgA.id, offsetMinutes: 60, template: "hi" } });

    const body = JSON.stringify({ appointmentId: apt.id, ruleId: rule.id });
    const res = await POST(makeRequest(body, { ...signed(body, orgB.n8nWebhookSecret), "x-reymen-orgid": orgA.id }));
    expect(res.status).toBe(401);

    const log = await prisma.appointmentReminderLog.findUnique({
      where: { appointmentId_ruleId: { appointmentId: apt.id, ruleId: rule.id } },
    });
    expect(log).toBeNull();
  });

  it("idempotency: resending the same event id does not double-process", async () => {
    const apt = await prisma.appointment.create({
      data: { organizationId: orgA.id, title: "Dedup Route Test", startTime: new Date(), endTime: new Date(Date.now() + 30 * 60 * 1000) },
    });
    const rule = await prisma.appointmentReminderRule.create({ data: { organizationId: orgA.id, offsetMinutes: 60, template: "hi" } });

    const body = JSON.stringify({ appointmentId: apt.id, ruleId: rule.id });
    const headers = { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id, "x-reymen-event-id": "evt-reminder-a" };

    const first = await POST(makeRequest(body, headers));
    expect(first.status).toBe(200);
    const second = await POST(makeRequest(body, headers));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });
  });
});
