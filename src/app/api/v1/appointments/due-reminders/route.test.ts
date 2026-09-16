// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { GET } = await import("./route");

function makeRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

describe("GET /api/v1/appointments/due-reminders", () => {
  let org: { id: string; n8nWebhookSecret: string };
  let otherOrg: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    org = await createTestOrg("Due Reminders Org");
    otherOrg = await createTestOrg("Due Reminders Other Org");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(otherOrg.id);
  });

  it("returns [] when no reminder rules are configured", async () => {
    const res = await GET(makeRequest(`http://localhost/api/v1/appointments/due-reminders?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns an appointment whose reminder window has opened and not yet been logged", async () => {
    const rule = await prisma.appointmentReminderRule.create({
      data: { organizationId: org.id, offsetMinutes: 60, template: "Hola {{contactName}}" },
    });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Cliente Due", phone: "+15551112222" } });
    const apt = await prisma.appointment.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        title: "Due Appointment",
        startTime: new Date(Date.now() + 30 * 60 * 1000), // 30 min out, within the 60-min window
        endTime: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const res = await GET(makeRequest(`http://localhost/api/v1/appointments/due-reminders?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ appointmentId: apt.id, ruleId: rule.id, contactName: "Cliente Due", contactPhone: "+15551112222" });
  });

  it("excludes an appointment whose reminder has already been logged", async () => {
    await prisma.appointmentReminderRule.deleteMany({ where: { organizationId: org.id } });
    const rule = await prisma.appointmentReminderRule.create({
      data: { organizationId: org.id, offsetMinutes: 60, template: "x" },
    });
    const apt = await prisma.appointment.create({
      data: { organizationId: org.id, title: "Already Sent", startTime: new Date(Date.now() + 30 * 60 * 1000), endTime: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await prisma.appointmentReminderLog.create({ data: { appointmentId: apt.id, ruleId: rule.id } });

    const res = await GET(makeRequest(`http://localhost/api/v1/appointments/due-reminders?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data.some((d: { appointmentId: string }) => d.appointmentId === apt.id)).toBe(false);
  });

  it("excludes an appointment whose reminder window has not opened yet", async () => {
    await prisma.appointmentReminderRule.deleteMany({ where: { organizationId: org.id } });
    const rule = await prisma.appointmentReminderRule.create({
      data: { organizationId: org.id, offsetMinutes: 60, template: "x" },
    });
    const apt = await prisma.appointment.create({
      data: { organizationId: org.id, title: "Too Far Out", startTime: new Date(Date.now() + 5 * 60 * 60 * 1000), endTime: new Date(Date.now() + 5.5 * 60 * 60 * 1000) },
    });

    const res = await GET(makeRequest(`http://localhost/api/v1/appointments/due-reminders?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data.some((d: { appointmentId: string; ruleId: string }) => d.appointmentId === apt.id && d.ruleId === rule.id)).toBe(false);
  });

  it("CRITICAL: never returns another organization's appointments", async () => {
    const res = await GET(makeRequest(`http://localhost/api/v1/appointments/due-reminders?orgId=${otherOrg.id}`, { "x-api-key": otherOrg.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("rejects a request authenticated with another org's key", async () => {
    const res = await GET(makeRequest(`http://localhost/api/v1/appointments/due-reminders?orgId=${org.id}`, { "x-api-key": otherOrg.n8nWebhookSecret }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with no api key and no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/appointments/due-reminders?orgId=${org.id}`));
    expect(res.status).toBe(401);
  });
});
