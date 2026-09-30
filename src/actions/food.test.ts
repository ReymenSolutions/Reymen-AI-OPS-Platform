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

describe("editing dishes and modifier groups keeps their ids (POS and history depend on them)", () => {
  let org: { id: string };
  let other: { id: string };
  let owner: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Food Edit In Place Org");
    other = await createTestOrg("Food Edit In Place Other Org");
    owner = await createTestUser(org.id, "OWNER", "food-edit-owner");
    await enable(org.id, "FOOD_OPS");
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(other.id);
  });

  it("CRITICAL: a dish edit updates variants in place, keeping their sales; removed ones go, new ones are added", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const cheese = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Queso", unit: "kg" } });
    const ham = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Jamón", unit: "kg" } });
    await food.createFoodDish({
      name: "Sándwich",
      variants: [
        { label: "Chico", price: 50, ingredients: [{ inventoryItemId: cheese.id, quantity: 0.03 }] },
        { label: "Grande", price: 80, ingredients: [{ inventoryItemId: cheese.id, quantity: 0.05 }] },
      ],
    });
    const dish = await prisma.foodDish.findFirstOrThrow({ where: { organizationId: org.id, name: "Sándwich" }, include: { variants: true } });
    const chico = dish.variants.find((v) => v.label === "Chico")!;
    const grande = dish.variants.find((v) => v.label === "Grande")!;
    await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId: chico.id, occurredAt: new Date("2026-09-29T06:00:00Z"), quantity: 7 } });

    await food.updateFoodDish(dish.id, {
      name: "Sándwich",
      variants: [
        // Se renombra y cambia su receta, identificada por id.
        { variantId: chico.id, label: "Mediano", price: 60, ingredients: [{ inventoryItemId: cheese.id, quantity: 0.04 }, { inventoryItemId: ham.id, quantity: 0.05 }] },
        { label: "Jumbo", price: 110, ingredients: [{ inventoryItemId: cheese.id, quantity: 0.08 }] },
      ],
    });

    const after = await prisma.foodDishVariant.findMany({ where: { dishId: dish.id }, include: { ingredients: true } });
    const mediano = after.find((v) => v.label === "Mediano")!;
    expect(mediano.id).toBe(chico.id);
    expect(Number(mediano.price)).toBe(60);
    expect(mediano.ingredients).toHaveLength(2);
    expect(after.map((v) => v.label).sort()).toEqual(["Jumbo", "Mediano"]);
    expect(after.some((v) => v.id === grande.id)).toBe(false);
    expect((await prisma.foodDishSale.findFirstOrThrow({ where: { variantId: chico.id } })).quantity).toBe(7);

    // Intercambiar nombres no choca con la unicidad (dishId, label).
    await food.updateFoodDish(dish.id, {
      name: "Sándwich",
      variants: [
        { variantId: mediano.id, label: "Jumbo", price: 60, ingredients: [{ inventoryItemId: cheese.id, quantity: 0.04 }] },
        { variantId: after.find((v) => v.label === "Jumbo")!.id, label: "Mediano", price: 110, ingredients: [{ inventoryItemId: cheese.id, quantity: 0.08 }] },
      ],
    });
    expect((await prisma.foodDishVariant.findUniqueOrThrow({ where: { id: mediano.id } })).label).toBe("Jumbo");
  });

  it("modifier options keep their ids, save their mini-recipe (negatives allowed) and reject foreign supplies", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const cheese = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Queso extra", unit: "kg" } });
    const onion = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Cebolla", unit: "kg" } });
    const foreign = await prisma.foodInventoryItem.create({ data: { organizationId: other.id, name: "Ajeno", unit: "kg" } });

    await food.createFoodModifierGroup({
      name: "Extras",
      minSelect: 0,
      maxSelect: 3,
      options: [
        { name: "Extra queso", priceDelta: 10, ingredients: [{ inventoryItemId: cheese.id, quantity: 0.03 }] },
        { name: "Sin cebolla", priceDelta: 0, ingredients: [{ inventoryItemId: onion.id, quantity: -0.02 }] },
      ],
    });
    const group = await prisma.foodModifierGroup.findFirstOrThrow({ where: { organizationId: org.id, name: "Extras" }, include: { options: true } });
    const extra = group.options.find((o) => o.name === "Extra queso")!;

    await food.updateFoodModifierGroup(group.id, {
      name: "Extras",
      minSelect: 0,
      maxSelect: 3,
      options: [
        { optionId: extra.id, name: "Extra queso", priceDelta: 12, ingredients: [{ inventoryItemId: cheese.id, quantity: 0.04 }] },
        { name: "Sin cebolla", priceDelta: 0, ingredients: [{ inventoryItemId: onion.id, quantity: -0.02 }] },
      ],
    });
    const after = await prisma.foodModifierOption.findMany({ where: { groupId: group.id }, include: { ingredients: true } });
    expect(after.map((o) => o.id).sort()).toEqual(group.options.map((o) => o.id).sort()); // "Sin cebolla" se emparejó por nombre
    const extraAfter = after.find((o) => o.id === extra.id)!;
    expect(Number(extraAfter.priceDelta)).toBe(12);
    expect(Number(extraAfter.ingredients[0].quantity)).toBe(0.04);
    expect(Number(after.find((o) => o.name === "Sin cebolla")!.ingredients[0].quantity)).toBe(-0.02);

    await expect(
      food.updateFoodModifierGroup(group.id, {
        name: "Extras",
        minSelect: 0,
        maxSelect: 3,
        options: [{ optionId: extra.id, name: "Extra queso", priceDelta: 12, ingredients: [{ inventoryItemId: foreign.id, quantity: 0.04 }] }],
      })
    ).rejects.toThrow("Uno o más insumos no son válidos");
    await expect(
      food.createFoodDish({ name: "Robado", variants: [{ label: "Único", price: 10, ingredients: [{ inventoryItemId: foreign.id, quantity: 1 }] }] })
    ).rejects.toThrow("Uno o más insumos no son válidos");
  });

  it("CRITICAL: removing a variant or option that already sold archives it instead of deleting its history", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const flour = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Harina", unit: "kg" } });
    await food.createFoodDish({
      name: "Pizza",
      variants: [
        { label: "Chica", price: 100, ingredients: [{ inventoryItemId: flour.id, quantity: 0.2 }] },
        { label: "Grande", price: 180, ingredients: [{ inventoryItemId: flour.id, quantity: 0.4 }] },
        { label: "Familiar", price: 250, ingredients: [{ inventoryItemId: flour.id, quantity: 0.6 }] },
      ],
    });
    const dish = await prisma.foodDish.findFirstOrThrow({ where: { organizationId: org.id, name: "Pizza" }, include: { variants: true } });
    const byLabel = (l: string) => dish.variants.find((v) => v.label === l)!;
    await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId: byLabel("Grande").id, occurredAt: new Date("2026-09-28T06:00:00Z"), quantity: 12 } });

    // Se quitan "Grande" (con ventas) y "Familiar" (sin ventas), y "Chica" se renombra a "Grande".
    await food.updateFoodDish(dish.id, {
      name: "Pizza",
      variants: [{ variantId: byLabel("Chica").id, label: "Grande", price: 120, ingredients: [{ inventoryItemId: flour.id, quantity: 0.25 }] }],
    });
    const archived = await prisma.foodDishVariant.findUniqueOrThrow({ where: { id: byLabel("Grande").id } });
    expect(archived.isActive).toBe(false);
    expect(archived.label).not.toBe("Grande"); // cedió su nombre a la variante activa
    expect((await prisma.foodDishSale.findFirstOrThrow({ where: { variantId: archived.id } })).quantity).toBe(12);
    expect(await prisma.foodDishVariant.count({ where: { id: byLabel("Familiar").id } })).toBe(0);

    const { getFoodMenuForPos, getFoodDishesWithCost } = await import("@/lib/food");
    const menuDish = (await getFoodMenuForPos(org.id)).find((d) => d.dishId === dish.id)!;
    expect(menuDish.variants.map((v) => v.label)).toEqual(["Grande"]);
    const editable = (await getFoodDishesWithCost(org.id)).find((d) => d.id === dish.id)!;
    expect(editable.variants.map((v) => v.id)).toEqual([byLabel("Chica").id]);

    // Volver a agregar una variante archivada por su nombre actual la reactiva, con su historial.
    await food.updateFoodDish(dish.id, {
      name: "Pizza",
      variants: [
        { variantId: byLabel("Chica").id, label: "Grande", price: 120, ingredients: [{ inventoryItemId: flour.id, quantity: 0.25 }] },
        { label: archived.label, price: 180, ingredients: [{ inventoryItemId: flour.id, quantity: 0.4 }] },
      ],
    });
    expect((await prisma.foodDishVariant.findUniqueOrThrow({ where: { id: archived.id } })).isActive).toBe(true);

    // Opciones: con ventas se desactiva, sin ventas se borra.
    await food.createFoodModifierGroup({
      name: "Orilla",
      minSelect: 0,
      maxSelect: 1,
      options: [
        { name: "Orilla rellena", priceDelta: 30 },
        { name: "Orilla delgada", priceDelta: 0 },
      ],
    });
    const group = await prisma.foodModifierGroup.findFirstOrThrow({ where: { organizationId: org.id, name: "Orilla" }, include: { options: true } });
    const stuffed = group.options.find((o) => o.name === "Orilla rellena")!;
    const thin = group.options.find((o) => o.name === "Orilla delgada")!;
    await prisma.foodModifierOptionSale.create({
      data: { organizationId: org.id, optionId: stuffed.id, optionName: stuffed.name, occurredAt: new Date("2026-09-28T06:00:00Z"), quantity: 4 },
    });
    await food.updateFoodModifierGroup(group.id, { name: "Orilla", minSelect: 0, maxSelect: 1, options: [{ name: "Orilla de queso", priceDelta: 35 }] });
    expect((await prisma.foodModifierOption.findUniqueOrThrow({ where: { id: stuffed.id } })).isActive).toBe(false);
    expect(await prisma.foodModifierOption.count({ where: { id: thin.id } })).toBe(0);
    const { getFoodModifierGroups } = await import("@/lib/food");
    const listed = (await getFoodModifierGroups(org.id)).find((g) => g.id === group.id)!;
    expect(listed.options.map((o) => o.name)).toEqual(["Orilla de queso"]);
  });

  it("CRITICAL: deleting a modifier group whose options sold archives it (keeps options and history, frees the name); unused groups are deleted", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const flour = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Harina grupos", unit: "kg" } });
    await food.createFoodModifierGroup({ name: "Salsas", minSelect: 0, maxSelect: 2, options: [{ name: "Verde", priceDelta: 0 }, { name: "Roja", priceDelta: 0 }] });
    await food.createFoodModifierGroup({ name: "Sin uso", minSelect: 0, maxSelect: 1, options: [{ name: "Algo", priceDelta: 0 }] });
    const salsas = await prisma.foodModifierGroup.findFirstOrThrow({ where: { organizationId: org.id, name: "Salsas" }, include: { options: true } });
    const unused = await prisma.foodModifierGroup.findFirstOrThrow({ where: { organizationId: org.id, name: "Sin uso" } });
    await food.createFoodDish({
      name: "Enchiladas",
      modifierGroupIds: [salsas.id],
      variants: [{ label: "Único", price: 90, ingredients: [{ inventoryItemId: flour.id, quantity: 0.1 }] }],
    });
    const verde = salsas.options.find((o) => o.name === "Verde")!;
    await prisma.foodModifierOptionSale.create({
      data: { organizationId: org.id, optionId: verde.id, optionName: "Verde", occurredAt: new Date("2026-09-28T06:00:00Z"), quantity: 9 },
    });

    await food.deleteFoodModifierGroup(salsas.id);
    const archived = await prisma.foodModifierGroup.findUniqueOrThrow({ where: { id: salsas.id }, include: { options: true, dishLinks: true } });
    expect(archived.isActive).toBe(false);
    expect(archived.options).toHaveLength(2);
    expect(archived.dishLinks).toHaveLength(0);
    expect(await prisma.foodModifierOptionSale.count({ where: { optionId: verde.id } })).toBe(1);

    const { getFoodModifierGroups, getFoodMenuForPos } = await import("@/lib/food");
    expect((await getFoodModifierGroups(org.id)).some((g) => g.id === salsas.id)).toBe(false);
    const dish = (await getFoodMenuForPos(org.id)).find((d) => d.name === "Enchiladas")!;
    expect(dish.modifierGroups).toHaveLength(0);

    // El nombre queda libre y el grupo archivado ya no se puede editar ni asignar.
    await food.createFoodModifierGroup({ name: "Salsas", minSelect: 0, maxSelect: 1, options: [{ name: "Verde", priceDelta: 0 }] });
    await expect(food.updateFoodModifierGroup(salsas.id, { name: "Salsas viejas", minSelect: 0, maxSelect: 1, options: [{ name: "X", priceDelta: 0 }] })).rejects.toThrow(
      "Grupo de modificadores no encontrado"
    );

    await food.deleteFoodModifierGroup(unused.id);
    expect(await prisma.foodModifierGroup.count({ where: { id: unused.id } })).toBe(0);
  });
});
