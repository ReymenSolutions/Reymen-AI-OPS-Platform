// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { setReminderRules } = await import("./appointment-reminders");

describe("appointment-reminders actions", () => {
  let org: { id: string };
  let owner: { id: string };
  let agent: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Reminders Actions Test Org");
    owner = await createTestUser(org.id, "OWNER", "reminders-owner");
    agent = await createTestUser(org.id, "AGENT", "reminders-agent");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("rejects a role without settings:manage", async () => {
    authMock.mockResolvedValue(fakeSession({ id: agent.id, role: "AGENT", organizationId: org.id }));
    await expect(setReminderRules([{ offsetMinutes: 60, channel: "whatsapp", template: "x", isActive: true }])).rejects.toThrow();
  });

  it("replaces the entire rule set on each save", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await setReminderRules([
      { offsetMinutes: 1440, channel: "whatsapp", template: "24h before", isActive: true },
      { offsetMinutes: 60, channel: "whatsapp", template: "1h before", isActive: true },
    ]);
    let rules = await prisma.appointmentReminderRule.findMany({ where: { organizationId: org.id } });
    expect(rules).toHaveLength(2);

    await setReminderRules([{ offsetMinutes: 30, channel: "whatsapp", template: "30min before", isActive: true }]);
    rules = await prisma.appointmentReminderRule.findMany({ where: { organizationId: org.id } });
    expect(rules).toHaveLength(1);
    expect(rules[0].offsetMinutes).toBe(30);
  });
});
