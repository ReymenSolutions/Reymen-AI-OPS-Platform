// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createLead, updateLeadStatus, deleteLead } = await import("./leads");

describe("leads actions", () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let userA: { id: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Leads Test Org A");
    orgB = await createTestOrg("Leads Test Org B");
    userA = await createTestUser(orgA.id, "OWNER", "leads-owner-a");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("rejects createLead with no session", async () => {
    authMock.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("name", "Nobody");
    await expect(createLead(fd)).rejects.toThrow();
  });

  it("creates a lead scoped to the caller's organization", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "Ana García");
    fd.set("email", "ana@example.com");
    const result = await createLead(fd);
    expect(result.success).toBe(true);

    const lead = await prisma.lead.findUnique({ where: { id: result.leadId } });
    expect(lead?.organizationId).toBe(orgA.id);
    expect(lead?.name).toBe("Ana García");
  });

  it("rejects an empty name", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "");
    await expect(createLead(fd)).rejects.toThrow();
  });

  it("treats an empty email as absent rather than an invalid email (regression)", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "No Email Lead");
    fd.set("email", "");
    const result = await createLead(fd);
    expect(result.success).toBe(true);
    const lead = await prisma.lead.findUnique({ where: { id: result.leadId } });
    expect(lead?.email).toBeNull();
  });

  it("enforces tenant isolation: org B cannot update or delete org A's lead", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "Isolation Target");
    const { leadId } = await createLead(fd);

    const userB = await createTestUser(orgB.id, "OWNER", "leads-owner-b");
    authMock.mockResolvedValue(fakeSession({ id: userB.id, role: "OWNER", organizationId: orgB.id }));

    await expect(updateLeadStatus(leadId, "WON")).rejects.toThrow();
    await expect(deleteLead(leadId)).rejects.toThrow();

    const stillThere = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(stillThere?.status).toBe("NEW");
    expect(stillThere?.deletedAt).toBeNull();
  });

  it("soft-deletes a lead (deletedAt set, row not removed)", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "To Be Deleted");
    const { leadId } = await createLead(fd);

    await deleteLead(leadId);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead).not.toBeNull();
    expect(lead?.deletedAt).not.toBeNull();
  });

  it("blocks creating a lead once the org's plan limit is reached", async () => {
    const orgC = await createTestOrg("Leads Plan Limit Org");
    await prisma.organization.update({ where: { id: orgC.id }, data: { plan: "starter" } });
    const userC = await createTestUser(orgC.id, "OWNER", "leads-owner-c");
    authMock.mockResolvedValue(fakeSession({ id: userC.id, role: "OWNER", organizationId: orgC.id }));

    await prisma.lead.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        organizationId: orgC.id,
        name: `Lead ${i}`,
        source: "manual",
      })),
    });

    const fd = new FormData();
    fd.set("name", "One Too Many");
    await expect(createLead(fd)).rejects.toThrow(/límite de leads/);

    await cleanupOrg(orgC.id);
  });

  it("blocks creating a lead when the org's CRM module is suspended, even for a role that has leads:create", async () => {
    const orgD = await createTestOrg("Leads Module Suspended Org");
    await prisma.organizationModule.update({
      where: { organizationId_module: { organizationId: orgD.id, module: "CRM" } },
      data: { status: "SUSPENDED" },
    });
    const userD = await createTestUser(orgD.id, "OWNER", "leads-owner-d");
    authMock.mockResolvedValue(fakeSession({ id: userD.id, role: "OWNER", organizationId: orgD.id }));

    const fd = new FormData();
    fd.set("name", "Should Not Be Created");
    await expect(createLead(fd)).rejects.toThrow(/módulo/i);

    const count = await prisma.lead.count({ where: { organizationId: orgD.id } });
    expect(count).toBe(0);

    await cleanupOrg(orgD.id);
  });
});
