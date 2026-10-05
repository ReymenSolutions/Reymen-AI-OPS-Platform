// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN",
}));

const { previewPosSalesPurgeAction, purgePosSalesAction } = await import("./food-purge");

describe("purgePosSalesAction", () => {
  let org: { id: string } | null = null;
  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
    org = null;
  });

  it("CRITICAL: refuses anyone who isn't a platform admin, including the client's owner", async () => {
    org = await createTestOrg("Purge Denied Org");
    authMock.mockResolvedValue(fakeSession({ id: "owner", role: "OWNER", organizationId: org.id }));
    await expect(previewPosSalesPurgeAction({ orgId: org.id, from: "2026-10-01", to: "2026-10-02" })).rejects.toThrow(/autorizado/i);
    await expect(purgePosSalesAction({ orgId: org.id, from: "2026-10-01", to: "2026-10-02", confirm: "BORRAR" })).rejects.toThrow(/autorizado/i);
  });

  it("requires typing BORRAR, validates dates, deletes only POS sales and logs it", async () => {
    org = await createTestOrg("Purge Org");
    const admin = await prisma.user.create({ data: { email: `purge-admin-${Date.now()}@test.local`, name: "Admin", role: "SUPER_ADMIN" } });
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "SUPER_ADMIN", organizationId: null }));
    const at = new Date(2026, 9, 1, 12);
    await prisma.foodSale.createMany({
      data: [
        { organizationId: org.id, occurredAt: at, grossAmount: 100, netAmount: 86, source: "POS" },
        { organizationId: org.id, occurredAt: at, grossAmount: 50, netAmount: 43, source: "MANUAL" },
      ],
    });

    await expect(purgePosSalesAction({ orgId: org.id, from: "2026-10-01", to: "2026-10-01", confirm: "borrar" })).rejects.toThrow(/BORRAR/);
    await expect(previewPosSalesPurgeAction({ orgId: org.id, from: "2026-10-02", to: "2026-10-01" })).rejects.toThrow(/anterior/);
    expect(await previewPosSalesPurgeAction({ orgId: org.id, from: "2026-10-01", to: "2026-10-01" })).toMatchObject({ sales: 1, grossAmount: 100 });

    const result = await purgePosSalesAction({ orgId: org.id, from: "2026-10-01", to: "2026-10-01", confirm: "BORRAR" });
    expect(result.sales).toBe(1);
    expect((await prisma.foodSale.findMany({ where: { organizationId: org.id } })).map((s) => s.source)).toEqual(["MANUAL"]);
    const audit = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "client.food_pos_sales_purge" } });
    expect(audit?.metadata).toMatchObject({ from: "2026-10-01", to: "2026-10-01", sales: 1, grossAmount: 100 });
    await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });
});
