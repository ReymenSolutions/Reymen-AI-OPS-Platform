// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const inv = await import("./food-inventory");

describe("food inventory, suppliers and purchases", () => {
  let org: { id: string };
  let other: { id: string };
  let owner: { id: string };
  let viewer: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Food Purchases Org");
    other = await createTestOrg("Food Purchases Other Org");
    owner = await createTestUser(org.id, "OWNER", "food-purch-owner");
    viewer = await createTestUser(org.id, "VIEWER", "food-purch-viewer");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(other.id);
  });
  beforeEach(() => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
  });

  it("edits an item's data without touching its stock", async () => {
    const item = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Tomate", unit: "kg", currentStock: 5 } });
    await inv.updateFoodInventoryItem(item.id, { name: "Tomate saladet", unit: "kg", category: "EDIBLE", minStock: 2, unitCost: 28.5 });
    const after = await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(after.name).toBe("Tomate saladet");
    expect(Number(after.minStock)).toBe(2);
    expect(Number(after.unitCost)).toBe(28.5);
    expect(Number(after.currentStock)).toBe(5);
  });

  it("units come from the list: written variants are normalized, a legacy unit is kept until changed", async () => {
    const item = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Naranja", unit: "2 pza" } });
    // Saving other fields keeps the legacy unit as it was.
    await inv.updateFoodInventoryItem(item.id, { name: "Naranja", unit: "2 pza", category: "EDIBLE", minStock: 3, unitCost: null });
    expect((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: item.id } })).unit).toBe("2 pza");
    await inv.updateFoodInventoryItem(item.id, { name: "Naranja", unit: "Piezas", category: "EDIBLE", minStock: 3, unitCost: null });
    expect((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: item.id } })).unit).toBe("pza");
    await expect(inv.updateFoodInventoryItem(item.id, { name: "Naranja", unit: "tazas", category: "EDIBLE", minStock: 3, unitCost: null })).rejects.toThrow(
      "Elige una unidad de la lista"
    );

    const food = await import("./food");
    const form = (unit: string, name: string) => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("unit", unit);
      return fd;
    };
    await food.createFoodInventoryItem(form("Pc", "Mango"));
    expect((await prisma.foodInventoryItem.findFirstOrThrow({ where: { organizationId: org.id, name: "Mango" } })).unit).toBe("pza");
    await expect(food.createFoodInventoryItem(form("2 pza", "Papaya"))).rejects.toThrow("Elige una unidad de la lista");
  });

  it("quick adjustments: stock in, waste with reason, count and production (with cost of the prepared item)", async () => {
    const tomato = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Tomatillo QA", unit: "kg", currentStock: 2, unitCost: 30 } });
    const chile = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Chile QA", unit: "kg", currentStock: 1, unitCost: 50 } });
    const salsa = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Salsa verde QA", unit: "l", currentStock: 0 } });
    const stock = async (id: string) => Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id } })).currentStock);

    await inv.recordInventoryAdjustment({ kind: "in", lines: [{ itemId: tomato.id, quantity: 3 }, { itemId: chile.id, quantity: 0 }] });
    expect(await stock(tomato.id)).toBe(5);

    await expect(inv.recordInventoryAdjustment({ kind: "waste", lines: [{ itemId: tomato.id, quantity: 1 }] })).rejects.toThrow("Escribe el motivo del desecho");
    await inv.recordInventoryAdjustment({ kind: "waste", lines: [{ itemId: tomato.id, quantity: 1 }], note: "Caducado" });
    expect(await stock(tomato.id)).toBe(4);

    // Production: +2 l of salsa from 1 kg tomatillo + 0.5 kg chile → cost (30 + 25) / 2 = 27.50 per l.
    const res = await inv.recordInventoryAdjustment({
      kind: "production",
      output: { itemId: salsa.id, quantity: 2 },
      lines: [{ itemId: tomato.id, quantity: 1 }, { itemId: chile.id, quantity: 0.5 }],
    });
    expect(res.movements).toBe(3);
    expect(await stock(salsa.id)).toBe(2);
    expect(await stock(tomato.id)).toBe(3);
    expect(await stock(chile.id)).toBe(0.5);
    expect(Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: salsa.id } })).unitCost)).toBe(27.5);
    const batch = await prisma.foodInventoryMovement.findMany({ where: { inventoryItemId: salsa.id, type: "PRODUCTION" } });
    expect(batch[0].batchId).toBeTruthy();
    expect(await prisma.foodInventoryMovement.count({ where: { batchId: batch[0].batchId } })).toBe(3);
    await expect(
      inv.recordInventoryAdjustment({ kind: "production", output: { itemId: salsa.id, quantity: 1 }, lines: [{ itemId: salsa.id, quantity: 1 }] }),
    ).rejects.toThrow("El preparado no puede ser también uno de sus insumos");

    // Count: only what was counted changes; the difference is recorded.
    await inv.recordInventoryAdjustment({ kind: "count", lines: [{ itemId: tomato.id, quantity: 2.5 }] });
    expect(await stock(tomato.id)).toBe(2.5);
    expect(await stock(chile.id)).toBe(0.5);

    const viewerSession = fakeSession({ id: viewer.id, role: "VIEWER", organizationId: org.id });
    authMock.mockResolvedValueOnce(viewerSession);
    await expect(inv.recordInventoryAdjustment({ kind: "in", lines: [{ itemId: tomato.id, quantity: 1 }] })).rejects.toThrow();
  });

  it("rejects a duplicate name and items from another org", async () => {
    const a = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Cebolla", unit: "kg" } });
    await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Ajo", unit: "kg" } });
    await expect(inv.updateFoodInventoryItem(a.id, { name: "Ajo", unit: "kg", category: "EDIBLE", minStock: 0, unitCost: null })).rejects.toThrow(
      "Ya existe un insumo con ese nombre"
    );
    const foreign = await prisma.foodInventoryItem.create({ data: { organizationId: other.id, name: "Ajeno", unit: "kg" } });
    await expect(inv.updateFoodInventoryItem(foreign.id, { name: "Mío", unit: "kg", category: "EDIBLE", minStock: 0, unitCost: null })).rejects.toThrow(
      "Insumo no encontrado"
    );
  });

  it("a stock count records the difference as an adjustment", async () => {
    const item = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Aceite", unit: "lt", currentStock: 10 } });
    await inv.adjustFoodInventoryStock(item.id, { countedStock: 7.25, note: "Conteo semanal" });
    expect(Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock)).toBe(7.25);
    const movements = await prisma.foodInventoryMovement.findMany({ where: { inventoryItemId: item.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0].type).toBe("ADJUSTMENT");
    expect(Number(movements[0].quantity)).toBe(-2.75);
    expect(movements[0].note).toBe("Conteo semanal");
  });

  it("edits a supplier", async () => {
    const s = await prisma.foodSupplier.create({ data: { organizationId: org.id, name: "Central de Abasto" } });
    await inv.updateFoodSupplier(s.id, { name: "Central de Abasto MTY", contactName: "Luis", phone: "8110000000", email: "", notes: "Entrega martes" });
    const after = await prisma.foodSupplier.findUniqueOrThrow({ where: { id: s.id } });
    expect(after).toMatchObject({ name: "Central de Abasto MTY", contactName: "Luis", email: null, notes: "Entrega martes" });
  });

  it("CRITICAL: a purchase adds stock, updates cost, and voiding it takes the stock back", async () => {
    const supplier = await prisma.foodSupplier.create({ data: { organizationId: org.id, name: "Carnes del Norte" } });
    const beef = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Arrachera", unit: "kg", currentStock: 1, unitCost: 300 } });
    const salt = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Sal", unit: "kg", currentStock: 0 } });

    const { id } = await inv.createFoodPurchase({
      supplierId: supplier.id,
      purchasedAt: "2026-09-30T18:00:00.000Z",
      items: [
        { inventoryItemId: beef.id, quantity: 5.5, unitCost: 320 },
        { inventoryItemId: salt.id, quantity: 2, unitCost: 12.5 },
      ],
    });

    const purchase = await prisma.foodPurchase.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(Number(purchase.total)).toBe(1785);
    expect(purchase.items).toHaveLength(2);
    const beefAfter = await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: beef.id } });
    expect(Number(beefAfter.currentStock)).toBe(6.5);
    expect(Number(beefAfter.unitCost)).toBe(320);

    await expect(inv.voidFoodPurchase(id, "  ")).rejects.toThrow("Indica el motivo de la anulación");
    await inv.voidFoodPurchase(id, "Capturada dos veces");
    expect(Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: beef.id } })).currentStock)).toBe(1);
    expect(Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: salt.id } })).currentStock)).toBe(0);
    await expect(inv.voidFoodPurchase(id, "otra vez")).rejects.toThrow("Esta compra ya está anulada");

    const types = (await prisma.foodInventoryMovement.findMany({ where: { purchaseId: id }, orderBy: { createdAt: "asc" } })).map((m) => m.type);
    expect(types.sort()).toEqual(["PURCHASE", "PURCHASE", "PURCHASE_VOID", "PURCHASE_VOID"]);
  });

  it("rejects purchases with repeated or foreign items and doesn't move stock", async () => {
    const item = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Limón", unit: "kg", currentStock: 0 } });
    const foreign = await prisma.foodInventoryItem.create({ data: { organizationId: other.id, name: "Limón ajeno", unit: "kg" } });
    await expect(
      inv.createFoodPurchase({ supplierId: null, purchasedAt: "2026-09-30T18:00:00.000Z", items: [{ inventoryItemId: item.id, quantity: 1, unitCost: 1 }, { inventoryItemId: item.id, quantity: 1, unitCost: 1 }] })
    ).rejects.toThrow("Un insumo aparece dos veces en la compra");
    await expect(
      inv.createFoodPurchase({ supplierId: null, purchasedAt: "2026-09-30T18:00:00.000Z", items: [{ inventoryItemId: foreign.id, quantity: 1, unitCost: 1 }] })
    ).rejects.toThrow("Uno o más insumos no son válidos");
    expect(Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock)).toBe(0);
    expect(Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: foreign.id } })).currentStock)).toBe(0);
  });

  it("deactivating an item hides it from purchases; deleting is only allowed while it has no recipes or purchases", async () => {
    const item = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Chile", unit: "kg", currentStock: 1 } });
    await inv.setFoodInventoryItemActive(item.id, false);
    await expect(
      inv.createFoodPurchase({ supplierId: null, purchasedAt: "2026-09-30T18:00:00.000Z", items: [{ inventoryItemId: item.id, quantity: 1, unitCost: 1 }] })
    ).rejects.toThrow("Uno o más insumos están desactivados");
    await inv.setFoodInventoryItemActive(item.id, true);
    await inv.createFoodPurchase({ supplierId: null, purchasedAt: "2026-09-30T18:00:00.000Z", items: [{ inventoryItemId: item.id, quantity: 1, unitCost: 1 }] });
    await expect(inv.deleteFoodInventoryItem(item.id)).rejects.toThrow("desactívalo en lugar de eliminarlo");

    const mistake = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Error de captura", unit: "kg" } });
    await inv.adjustFoodInventoryStock(mistake.id, { countedStock: 2 });
    await inv.deleteFoodInventoryItem(mistake.id);
    expect(await prisma.foodInventoryItem.count({ where: { id: mistake.id } })).toBe(0);
  });

  it("suppliers: deactivated ones can't receive purchases; only suppliers without purchases can be deleted", async () => {
    const item = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Crema", unit: "lt" } });
    const used = await prisma.foodSupplier.create({ data: { organizationId: org.id, name: "Lala" } });
    await inv.createFoodPurchase({ supplierId: used.id, purchasedAt: "2026-09-30T18:00:00.000Z", items: [{ inventoryItemId: item.id, quantity: 1, unitCost: 30 }] });
    await expect(inv.deleteFoodSupplier(used.id)).rejects.toThrow("tiene compras registradas");
    await inv.setFoodSupplierActive(used.id, false);
    await expect(
      inv.createFoodPurchase({ supplierId: used.id, purchasedAt: "2026-09-30T18:00:00.000Z", items: [{ inventoryItemId: item.id, quantity: 1, unitCost: 30 }] })
    ).rejects.toThrow("Este proveedor está desactivado");

    const unused = await prisma.foodSupplier.create({ data: { organizationId: org.id, name: "Duplicado" } });
    await inv.deleteFoodSupplier(unused.id);
    expect(await prisma.foodSupplier.count({ where: { id: unused.id } })).toBe(0);
  });

  it("CRITICAL: voiding a purchase restores the item's previous cost, unless a later purchase or an edit already changed it", async () => {
    const item = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Aguacate", unit: "kg", unitCost: 40 } });
    const buy = (cost: number) =>
      inv.createFoodPurchase({ supplierId: null, purchasedAt: "2026-09-30T18:00:00.000Z", items: [{ inventoryItemId: item.id, quantity: 1, unitCost: cost }] });
    const cost = async () => Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: item.id } })).unitCost);

    const wrong = await buy(450); // se tecleó 450 en vez de 45
    expect(await cost()).toBe(450);
    await inv.voidFoodPurchase(wrong.id, "Precio mal capturado");
    expect(await cost()).toBe(40);

    const first = await buy(45);
    await buy(50);
    await inv.voidFoodPurchase(first.id, "Duplicada");
    expect(await cost()).toBe(50); // la compra posterior manda

    const third = await buy(55);
    await inv.updateFoodInventoryItem(item.id, { name: "Aguacate", unit: "kg", category: "EDIBLE", minStock: 0, unitCost: 52 });
    await inv.voidFoodPurchase(third.id, "Error");
    expect(await cost()).toBe(52); // la edición manual manda
  });

  it("the recipe recalculation rejects a future date", async () => {
    const future = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    await expect(inv.recalculateFoodRecipeUsage(future)).rejects.toThrow("La fecha no puede ser futura");
  });

  it("a VIEWER can't edit, adjust or buy", async () => {
    authMock.mockResolvedValue(fakeSession({ id: viewer.id, role: "VIEWER", organizationId: org.id }));
    const item = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Papa", unit: "kg", currentStock: 3 } });
    await expect(inv.adjustFoodInventoryStock(item.id, { countedStock: 0 })).rejects.toThrow();
    await expect(inv.createFoodPurchase({ supplierId: null, purchasedAt: "2026-09-30T18:00:00.000Z", items: [{ inventoryItemId: item.id, quantity: 1, unitCost: 1 }] })).rejects.toThrow();
    await expect(inv.setFoodInventoryItemActive(item.id, false)).rejects.toThrow();
    await expect(inv.deleteFoodInventoryItem(item.id)).rejects.toThrow();
    await expect(inv.recalculateFoodRecipeUsage(new Date().toISOString())).rejects.toThrow();
    expect(await prisma.foodInventoryItem.count({ where: { id: item.id, isActive: true } })).toBe(1);
    expect(Number((await prisma.foodInventoryItem.findUniqueOrThrow({ where: { id: item.id } })).currentStock)).toBe(3);
  });
});
