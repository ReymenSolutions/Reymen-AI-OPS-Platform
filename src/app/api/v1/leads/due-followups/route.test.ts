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

/** Backdates a Lead's updatedAt via raw SQL — Prisma's @updatedAt auto-touch on .update() makes this the only reliable way to simulate "has been sitting in this status for a while". */
async function backdateLeadUpdatedAt(leadId: string, minutesAgo: number) {
  await prisma.$executeRaw`UPDATE "Lead" SET "updatedAt" = NOW() - (${minutesAgo} || ' minutes')::interval WHERE id = ${leadId}`;
}

async function backdateFollowUpLogSentAt(logId: string, minutesAgo: number) {
  await prisma.$executeRaw`UPDATE "FollowUpLog" SET "sentAt" = NOW() - (${minutesAgo} || ' minutes')::interval WHERE id = ${logId}`;
}

describe("GET /api/v1/leads/due-followups", () => {
  let org: { id: string; n8nWebhookSecret: string };
  let otherOrg: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    org = await createTestOrg("Due FollowUps Org");
    otherOrg = await createTestOrg("Due FollowUps Other Org");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(otherOrg.id);
  });

  it("returns [] when no follow-up rules are configured", async () => {
    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("returns a lead whose delay window has opened and not yet been attempted", async () => {
    const rule = await prisma.followUpRule.create({
      data: { organizationId: org.id, name: "24h", triggerStatus: "NEW", delayMinutes: 60, template: "Hola {{contactName}}" },
    });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Due Lead", phone: "+15553330000" } });
    await backdateLeadUpdatedAt(lead.id, 90); // 90 min ago, past the 60-min delay

    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data).toContainEqual(expect.objectContaining({ leadId: lead.id, ruleId: rule.id, contactName: "Due Lead", attemptNumber: 1 }));

    await prisma.followUpRule.delete({ where: { id: rule.id } });
  });

  it("excludes a lead whose delay window has not opened yet", async () => {
    const rule = await prisma.followUpRule.create({
      data: { organizationId: org.id, name: "24h", triggerStatus: "NEW", delayMinutes: 120, template: "x" },
    });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Too Recent Lead" } });
    await backdateLeadUpdatedAt(lead.id, 10); // only 10 min ago, well under the 120-min delay

    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data.some((d: { leadId: string }) => d.leadId === lead.id)).toBe(false);

    await prisma.followUpRule.delete({ where: { id: rule.id } });
  });

  it("excludes a lead with doNotContact set", async () => {
    const rule = await prisma.followUpRule.create({
      data: { organizationId: org.id, name: "24h", triggerStatus: "NEW", delayMinutes: 60, template: "x" },
    });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Opted Out Lead", doNotContact: true } });
    await backdateLeadUpdatedAt(lead.id, 90);

    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data.some((d: { leadId: string }) => d.leadId === lead.id)).toBe(false);

    await prisma.followUpRule.delete({ where: { id: rule.id } });
  });

  it("excludes a lead whose status doesn't match the rule's triggerStatus", async () => {
    const rule = await prisma.followUpRule.create({
      data: { organizationId: org.id, name: "24h", triggerStatus: "NEW", delayMinutes: 60, template: "x" },
    });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Wrong Status Lead", status: "QUALIFIED" } });
    await backdateLeadUpdatedAt(lead.id, 90);

    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data.some((d: { leadId: string }) => d.leadId === lead.id)).toBe(false);

    await prisma.followUpRule.delete({ where: { id: rule.id } });
  });

  it("excludes a lead already at the rule's maxAttempts", async () => {
    const rule = await prisma.followUpRule.create({
      data: { organizationId: org.id, name: "single", triggerStatus: "NEW", delayMinutes: 60, maxAttempts: 1, template: "x" },
    });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Maxed Out Lead" } });
    await backdateLeadUpdatedAt(lead.id, 90);
    await prisma.followUpLog.create({ data: { leadId: lead.id, ruleId: rule.id } });

    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data.some((d: { leadId: string }) => d.leadId === lead.id)).toBe(false);

    await prisma.followUpRule.delete({ where: { id: rule.id } });
  });

  it("a repeating rule returns the lead again once repeatIntervalMinutes has elapsed since the last attempt", async () => {
    const rule = await prisma.followUpRule.create({
      data: { organizationId: org.id, name: "repeat", triggerStatus: "NEW", delayMinutes: 60, repeatIntervalMinutes: 60, maxAttempts: 3, template: "x" },
    });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Repeat Ready Lead" } });
    await backdateLeadUpdatedAt(lead.id, 200);
    const log = await prisma.followUpLog.create({ data: { leadId: lead.id, ruleId: rule.id } });
    await backdateFollowUpLogSentAt(log.id, 90); // last attempt 90 min ago, past the 60-min repeat interval

    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data).toContainEqual(expect.objectContaining({ leadId: lead.id, ruleId: rule.id, attemptNumber: 2 }));

    await prisma.followUpRule.delete({ where: { id: rule.id } });
  });

  it("a repeating rule does NOT return the lead before repeatIntervalMinutes has elapsed", async () => {
    const rule = await prisma.followUpRule.create({
      data: { organizationId: org.id, name: "repeat-too-soon", triggerStatus: "NEW", delayMinutes: 60, repeatIntervalMinutes: 120, maxAttempts: 3, template: "x" },
    });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Repeat Too Soon Lead" } });
    await backdateLeadUpdatedAt(lead.id, 200);
    const log = await prisma.followUpLog.create({ data: { leadId: lead.id, ruleId: rule.id } });
    await backdateFollowUpLogSentAt(log.id, 30); // only 30 min ago, well under the 120-min repeat interval

    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data.some((d: { leadId: string }) => d.leadId === lead.id)).toBe(false);

    await prisma.followUpRule.delete({ where: { id: rule.id } });
  });

  it("a single-fire rule (no repeatIntervalMinutes) never returns a lead that already has one attempt", async () => {
    const rule = await prisma.followUpRule.create({
      data: { organizationId: org.id, name: "single-fire", triggerStatus: "NEW", delayMinutes: 60, maxAttempts: 5, template: "x" },
    });
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Single Fire Lead" } });
    await backdateLeadUpdatedAt(lead.id, 200);
    const log = await prisma.followUpLog.create({ data: { leadId: lead.id, ruleId: rule.id } });
    await backdateFollowUpLogSentAt(log.id, 1000); // long ago — would qualify for a repeat if one were configured

    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${org.id}`, { "x-api-key": org.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data.some((d: { leadId: string }) => d.leadId === lead.id)).toBe(false);

    await prisma.followUpRule.delete({ where: { id: rule.id } });
  });

  it("CRITICAL: never returns another organization's leads", async () => {
    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${otherOrg.id}`, { "x-api-key": otherOrg.n8nWebhookSecret }));
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it("rejects a request authenticated with another org's key", async () => {
    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${org.id}`, { "x-api-key": otherOrg.n8nWebhookSecret }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with no api key and no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/leads/due-followups?orgId=${org.id}`));
    expect(res.status).toBe(401);
  });
});
