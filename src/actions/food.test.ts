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

describe("manual per-dish sales move inventory by the difference only", () => {
  let org: { id: string };
  let owner: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Food Manual Dish Stock Org");
    owner = await createTestUser(org.id, "OWNER", "food-manual-owner");
    await enable(org.id, "FOOD_OPS");
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("re-saving the day's quantity deducts only what changed", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const cheese = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Queso", unit: "kg", currentStock: 10 } });
    const dish = await prisma.foodDish.create({
      data: {
        organizationId: org.id,
        name: "Quesadilla",
        variants: { create: [{ organizationId: org.id, label: "Único", price: 60, ingredients: { create: [{ inventoryItemId: cheese.id, quantity: 0.1 }] } }] },
      },
      include: { variants: true },
    });
    const variantId = dish.variants[0].id;

    await food.logFoodDishSales({ date: "2026-09-30", entries: [{ variantId, quantity: 3 }] });
    await food.logFoodDishSales({ date: "2026-09-30", entries: [{ variantId, quantity: 5 }] });
    await food.logFoodDishSales({ date: "2026-09-30", entries: [{ variantId, quantity: 4 }] });

    const after = await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: cheese.id } });
    expect(Number(after.currentStock)).toBeCloseTo(9.6, 3); // 10 − 0.1 × 4 (lo último guardado)
    const deltas = (await prisma.foodInventoryMovement.findMany({ where: { inventoryItemId: cheese.id }, orderBy: { createdAt: "asc" } })).map((m) => Number(m.quantity));
    expect(deltas).toEqual([-0.3, -0.2, 0.1]);
  });
});

describe("food:manage permission", () => {
  let org: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Food Permission Org");
    await enable(org.id, "FOOD_OPS");
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("CRITICAL: a VIEWER or AGENT can't change Food; a MANAGER can", async () => {
    for (const role of ["VIEWER", "AGENT"] as const) {
      const user = await createTestUser(org.id, role, `food-${role.toLowerCase()}`);
      authMock.mockResolvedValue(fakeSession({ id: user.id, role, organizationId: org.id }));
      await expect(food.createFoodOperatingCost({ name: "Renta", amountMonthly: 1000 })).rejects.toThrow(/no autorizado/i);
    }
    const manager = await createTestUser(org.id, "MANAGER", "food-manager");
    authMock.mockResolvedValue(fakeSession({ id: manager.id, role: "MANAGER", organizationId: org.id }));
    await food.createFoodOperatingCost({ name: "Renta", amountMonthly: 1000 });
    expect(await prisma.foodOperatingCost.count({ where: { organizationId: org.id } })).toBe(1);
  });
});

describe("manual sales can be edited and deleted; POS sales can't", () => {
  let org: { id: string };
  let owner: { id: string };
  let viewer: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Food Manual Sale Edit Org");
    owner = await createTestUser(org.id, "OWNER", "food-sale-edit-owner");
    viewer = await createTestUser(org.id, "VIEWER", "food-sale-edit-viewer");
    await enable(org.id, "FOOD_OPS");
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("edits and deletes a manual sale", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await food.createFoodSale(saleForm());
    const sale = await prisma.foodSale.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(sale.source).toBe("MANUAL");

    await food.updateFoodSale(sale.id, { occurredAt: "2026-09-29T20:00", channel: "Domicilio", grossAmount: 150, netAmount: 129.31, notes: "Corregida" });
    const edited = await prisma.foodSale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(edited).toMatchObject({ channel: "Domicilio", notes: "Corregida" });
    expect(Number(edited.grossAmount)).toBe(150);
    await expect(food.updateFoodSale(sale.id, { occurredAt: "2026-09-29T20:00", grossAmount: 100, netAmount: 120 })).rejects.toThrow(
      "El neto no puede ser mayor que el bruto"
    );

    authMock.mockResolvedValue(fakeSession({ id: viewer.id, role: "VIEWER", organizationId: org.id }));
    await expect(food.deleteFoodSale(sale.id)).rejects.toThrow();

    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await food.deleteFoodSale(sale.id);
    expect(await prisma.foodSale.count({ where: { id: sale.id } })).toBe(0);
  });

  it("refuses to edit or delete a sale that came from the POS", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const pos = await prisma.foodSale.create({ data: { organizationId: org.id, grossAmount: 900, netAmount: 775.86, channel: "POS", source: "POS" } });
    await expect(food.deleteFoodSale(pos.id)).rejects.toThrow("cancélala en el POS");
    await expect(food.updateFoodSale(pos.id, { occurredAt: "2026-09-29T20:00", grossAmount: 1, netAmount: 1 })).rejects.toThrow("cancélala en el POS");
    expect(await prisma.foodSale.count({ where: { id: pos.id } })).toBe(1);
  });
});
