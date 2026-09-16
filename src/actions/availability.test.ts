// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { setAvailabilityRules, setOrgTimezone } = await import("./availability");

describe("availability actions", () => {
  let org: { id: string };
  let owner: { id: string };
  let agent: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Availability Actions Test Org");
    owner = await createTestUser(org.id, "OWNER", "avail-owner");
    agent = await createTestUser(org.id, "AGENT", "avail-agent");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("rejects a role without settings:manage", async () => {
    authMock.mockResolvedValue(fakeSession({ id: agent.id, role: "AGENT", organizationId: org.id }));
    await expect(setAvailabilityRules([{ dayOfWeek: 1, startMinute: 0, endMinute: 60 }])).rejects.toThrow();
  });

  it("replaces the entire weekly grid on each save", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await setAvailabilityRules([
      { dayOfWeek: 1, startMinute: 540, endMinute: 1080 },
      { dayOfWeek: 2, startMinute: 540, endMinute: 1080 },
    ]);
    let rules = await prisma.availabilityRule.findMany({ where: { organizationId: org.id } });
    expect(rules).toHaveLength(2);

    await setAvailabilityRules([{ dayOfWeek: 3, startMinute: 600, endMinute: 900 }]);
    rules = await prisma.availabilityRule.findMany({ where: { organizationId: org.id } });
    expect(rules).toHaveLength(1);
    expect(rules[0].dayOfWeek).toBe(3);
  });

  it("clearing the grid (empty array) removes all rules", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await setAvailabilityRules([{ dayOfWeek: 1, startMinute: 0, endMinute: 60 }]);
    await setAvailabilityRules([]);
    const rules = await prisma.availabilityRule.findMany({ where: { organizationId: org.id } });
    expect(rules).toHaveLength(0);
  });

  it("rejects a rule where endMinute is not after startMinute", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await expect(setAvailabilityRules([{ dayOfWeek: 1, startMinute: 600, endMinute: 600 }])).rejects.toThrow();
  });

  it("setOrgTimezone updates the organization and rejects an invalid zone", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await setOrgTimezone("America/Bogota");
    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(updated.timezone).toBe("America/Bogota");

    await expect(setOrgTimezone("Not/A_Real_Zone")).rejects.toThrow(/inválida/i);
  });

  it("enforces tenant isolation: org B's grid is untouched by org A's save", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await setAvailabilityRules([{ dayOfWeek: 4, startMinute: 0, endMinute: 60 }]);

    const orgB = await createTestOrg("Availability Org B");
    const ownerB = await createTestUser(orgB.id, "OWNER", "avail-owner-b");
    authMock.mockResolvedValue(fakeSession({ id: ownerB.id, role: "OWNER", organizationId: orgB.id }));
    await setAvailabilityRules([{ dayOfWeek: 5, startMinute: 0, endMinute: 60 }]);

    const orgARules = await prisma.availabilityRule.findMany({ where: { organizationId: org.id } });
    expect(orgARules).toHaveLength(1);
    expect(orgARules[0].dayOfWeek).toBe(4);

    await cleanupOrg(orgB.id);
  });
});
