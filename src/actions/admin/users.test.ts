// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  isAdmin: (role: string) => role === "ADMIN" || role === "SUPER_ADMIN",
}));

const { createOrgUser } = await import("./users");

describe("admin createOrgUser", () => {
  let org: { id: string };
  let admin: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Admin Users Test Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "professional" } });
    admin = await createTestUser(null, "ADMIN", "admin-users-admin");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
    await prisma.user.deleteMany({ where: { id: admin.id } });
  });

  it("denies a non-admin", async () => {
    const owner = await createTestUser(org.id, "OWNER", "admin-users-owner");
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await expect(
      createOrgUser(org.id, { name: "Nope", email: `nope.${Date.now()}@test.local`, role: "AGENT", password: "password123" })
    ).rejects.toThrow(/no autorizado/i);
  });

  it("creates a user in the client's org with a hashed password", async () => {
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "ADMIN", organizationId: null }));
    const email = `created.${Date.now()}@test.local`;
    const result = await createOrgUser(org.id, { name: "New Manager", email, role: "MANAGER", password: "password123" });
    expect(result.success).toBe(true);

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created?.organizationId).toBe(org.id);
    expect(created?.role).toBe("MANAGER");
    expect(created?.passwordHash).not.toBe("password123");
  });

  it("rejects a duplicate email", async () => {
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "ADMIN", organizationId: null }));
    const adminRecord = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    await expect(
      createOrgUser(org.id, { name: "Dupe", email: adminRecord.email, role: "AGENT", password: "password123" })
    ).rejects.toThrow(/ya existe/i);
  });

  // Antes el alta desde admin se saltaba el límite de usuarios del plan que
  // sí aplicaba inviteTeamMember; ahora ambos pasan por createOrgUserRecord.
  it("respects the org's plan user limit, same as inviteTeamMember", async () => {
    const limitedOrg = await createTestOrg("Admin Users Plan Limit Org");
    await prisma.organization.update({ where: { id: limitedOrg.id }, data: { plan: "starter" } });
    await createTestUser(limitedOrg.id, "OWNER", "admin-limited-owner");
    await createTestUser(limitedOrg.id, "AGENT", "admin-limited-agent");
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "ADMIN", organizationId: null }));

    await expect(
      createOrgUser(limitedOrg.id, { name: "One Too Many", email: `otm.${Date.now()}@test.local`, role: "AGENT", password: "password123" })
    ).rejects.toThrow(/límite de usuarios/);

    await cleanupOrg(limitedOrg.id);
  });
});
