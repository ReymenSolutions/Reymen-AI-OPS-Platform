// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { setFollowUpRules } = await import("./follow-up-rules");

describe("follow-up-rules actions", () => {
  let org: { id: string };
  let owner: { id: string };
  let agent: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("FollowUp Rules Test Org");
    owner = await createTestUser(org.id, "OWNER", "followup-owner");
    agent = await createTestUser(org.id, "AGENT", "followup-agent");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("rejects a role without settings:manage", async () => {
    authMock.mockResolvedValue(fakeSession({ id: agent.id, role: "AGENT", organizationId: org.id }));
    await expect(
      setFollowUpRules([{ name: "x", triggerStatus: "NEW", delayMinutes: 60, maxAttempts: 1, channel: "whatsapp", template: "hi", isActive: true }])
    ).rejects.toThrow();
  });

  it("replaces the entire rule set on each save", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await setFollowUpRules([
      { name: "24h sin contactar", triggerStatus: "NEW", delayMinutes: 1440, maxAttempts: 1, channel: "whatsapp", template: "hola", isActive: true },
      { name: "Recontacto semanal", triggerStatus: "CONTACTED", delayMinutes: 60, repeatIntervalMinutes: 10080, maxAttempts: 3, channel: "whatsapp", template: "seguimos", isActive: true },
    ]);
    let rules = await prisma.followUpRule.findMany({ where: { organizationId: org.id } });
    expect(rules).toHaveLength(2);

    await setFollowUpRules([{ name: "Solo una", triggerStatus: "QUALIFIED", delayMinutes: 30, maxAttempts: 1, channel: "whatsapp", template: "x", isActive: true }]);
    rules = await prisma.followUpRule.findMany({ where: { organizationId: org.id } });
    expect(rules).toHaveLength(1);
    expect(rules[0].triggerStatus).toBe("QUALIFIED");
  });

  it("clearing the rule set (empty array) removes all rules", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await setFollowUpRules([{ name: "temp", triggerStatus: "NEW", delayMinutes: 60, maxAttempts: 1, channel: "whatsapp", template: "x", isActive: true }]);
    await setFollowUpRules([]);
    const rules = await prisma.followUpRule.findMany({ where: { organizationId: org.id } });
    expect(rules).toHaveLength(0);
  });

  it("defaults repeatIntervalMinutes to null and maxAttempts to 1 when omitted", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await setFollowUpRules([{ name: "sin repetir", triggerStatus: "NEW", delayMinutes: 60, channel: "whatsapp", template: "x", isActive: true }]);
    const rule = await prisma.followUpRule.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(rule.repeatIntervalMinutes).toBeNull();
    expect(rule.maxAttempts).toBe(1);
  });

  it("enforces tenant isolation: org B's rules are untouched by org A's save", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await setFollowUpRules([{ name: "org A rule", triggerStatus: "NEW", delayMinutes: 60, maxAttempts: 1, channel: "whatsapp", template: "x", isActive: true }]);

    const orgB = await createTestOrg("FollowUp Rules Org B");
    const ownerB = await createTestUser(orgB.id, "OWNER", "followup-owner-b");
    authMock.mockResolvedValue(fakeSession({ id: ownerB.id, role: "OWNER", organizationId: orgB.id }));
    await setFollowUpRules([{ name: "org B rule", triggerStatus: "NEW", delayMinutes: 60, maxAttempts: 1, channel: "whatsapp", template: "x", isActive: true }]);

    const orgARules = await prisma.followUpRule.findMany({ where: { organizationId: org.id } });
    expect(orgARules).toHaveLength(1);
    expect(orgARules[0].name).toBe("org A rule");

    await cleanupOrg(orgB.id);
  });
});
