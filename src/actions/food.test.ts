// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const food = await import("./food");

async function enable(orgId: string, module: "FOOD_OPS" | "REYMEN_POS") {
  await prisma.organizationModule.create({ data: { organizationId: orgId, module, status: "ACTIVE", source: "SUBSCRIBED" } });
}

function saleForm() {
  const fd = new FormData();
  fd.set("occurredAt", "2026-09-30T10:00");
  fd.set("grossAmount", "100");
  fd.set("netAmount", "86.21");
  return fd;
}

describe("Reymen POS locks manual sales entry", () => {
  let org: { id: string };
  let owner: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Food POS Lock Org");
    owner = await createTestUser(org.id, "OWNER", "food-pos-owner");
    await enable(org.id, "FOOD_OPS");
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("allows manual sales while the org doesn't use Reymen POS", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await food.createFoodSale(saleForm());
    expect(await prisma.foodSale.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("CRITICAL: blocks both manual sale forms once Reymen POS is enabled", async () => {
    await enable(org.id, "REYMEN_POS");
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await expect(food.createFoodSale(saleForm())).rejects.toThrow(/Reymen POS/);
    await expect(food.logFoodDishSales({ date: "2026-09-30", entries: [{ variantId: "x", quantity: 1 }] })).rejects.toThrow(/Reymen POS/);
    expect(await prisma.foodSale.count({ where: { organizationId: org.id } })).toBe(1);
  });
});
