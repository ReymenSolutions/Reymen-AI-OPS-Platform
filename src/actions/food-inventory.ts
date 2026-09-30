"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireFoodManager } from "@/lib/guards";
import { applyStockMovements, recalculateRecipeUsage } from "@/lib/food-inventory";
import { UserError } from "@/lib/user-error";

// ─── FOOD OPS — Insumos, proveedores y compras ───────────────────────
// Editar insumos y proveedores, ajustar existencias por conteo físico, y el
// registro de compras. Todo cambio de existencia pasa por
// applyStockMovements() para que quede en la bitácora de movimientos.

function revalidateInventory() {
  revalidatePath("/portal/food/inventory");
  revalidatePath("/portal/food/purchases");
  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

// ── Insumos ──────────────────────────────────────────────────────────

const inventoryItemSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido"),
  unit: z.string().trim().min(1, "Unidad requerida"),
  category: z.enum(["EDIBLE", "NON_EDIBLE"]),
  minStock: z.number().min(0, "No puede ser negativo"),
  unitCost: z.number().min(0, "No puede ser negativo").nullable(),
});

/** Edita los datos de un insumo. La existencia NO se cambia aquí: para eso está adjustFoodInventoryStock (queda registrada). */
export async function updateFoodInventoryItem(itemId: string, data: z.input<typeof inventoryItemSchema>) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = inventoryItemSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos de insumo inválidos");

  const item = await prisma.foodInventoryItem.findFirst({ where: { id: itemId, organizationId } });
  if (!item) throw new UserError("Insumo no encontrado");

  const duplicate = await prisma.foodInventoryItem.findFirst({
    where: { organizationId, name: parsed.data.name, id: { not: itemId } },
    select: { id: true },
  });
  if (duplicate) throw new UserError("Ya existe un insumo con ese nombre");

  await prisma.foodInventoryItem.update({
    where: { id: itemId },
    data: {
      name: parsed.data.name,
      unit: parsed.data.unit,
      category: parsed.data.category,
      minStock: parsed.data.minStock,
      unitCost: parsed.data.unitCost,
    },
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.inventory_item_update",
    resource: "FoodInventoryItem",
    resourceId: itemId,
    metadata: { before: { name: item.name, unitCost: item.unitCost?.toString() ?? null }, after: parsed.data },
  });
  revalidateInventory();
}

/** Desactivar oculta el insumo de compras y recetas nuevas sin perder su historial. */
export async function setFoodInventoryItemActive(itemId: string, isActive: boolean) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const item = await prisma.foodInventoryItem.findFirst({ where: { id: itemId, organizationId }, select: { id: true, name: true } });
  if (!item) throw new UserError("Insumo no encontrado");

  await prisma.foodInventoryItem.update({ where: { id: itemId }, data: { isActive } });
  await logAudit({
    organizationId,
    userId: session.user.id,
    action: isActive ? "food.inventory_item_activate" : "food.inventory_item_deactivate",
    resource: "FoodInventoryItem",
    resourceId: itemId,
    metadata: { name: item.name },
  });
  revalidateInventory();
}

/**
 * Borra un insumo dado de alta por error. Si ya está en una receta o en una
 * compra, se rechaza: borrarlo rompería ese historial, para eso está desactivar.
 */
export async function deleteFoodInventoryItem(itemId: string) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const item = await prisma.foodInventoryItem.findFirst({
    where: { id: itemId, organizationId },
    select: { name: true, _count: { select: { dishLinks: true, purchaseItems: true } } },
  });
  if (!item) throw new UserError("Insumo no encontrado");
  if (item._count.dishLinks > 0 || item._count.purchaseItems > 0) {
    throw new UserError("Este insumo se usa en recetas o compras; desactívalo en lugar de eliminarlo");
  }

  await prisma.foodInventoryItem.delete({ where: { id: itemId } });
  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.inventory_item_delete",
    resource: "FoodInventoryItem",
    resourceId: itemId,
    metadata: { name: item.name },
  });
  revalidateInventory();
}

const adjustSchema = z.object({
  countedStock: z.number().finite("Cantidad inválida"),
  note: z.string().trim().max(500).optional(),
});

/** Conteo físico: fija la existencia al valor contado y registra la diferencia como ajuste. */
export async function adjustFoodInventoryStock(itemId: string, data: z.input<typeof adjustSchema>) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = adjustSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos inválidos");

  await prisma.$transaction(async (tx) => {
    const item = await tx.foodInventoryItem.findFirst({ where: { id: itemId, organizationId }, select: { currentStock: true } });
    if (!item) throw new UserError("Insumo no encontrado");
    const delta = parsed.data.countedStock - Number(item.currentStock);
    await applyStockMovements(tx, organizationId, [{ inventoryItemId: itemId, delta }], {
      type: "ADJUSTMENT",
      note: parsed.data.note || undefined,
      userId: session.user.id,
    });
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.inventory_adjust",
    resource: "FoodInventoryItem",
    resourceId: itemId,
    metadata: { countedStock: parsed.data.countedStock, note: parsed.data.note ?? null },
  });
  revalidateInventory();
}

// ── Proveedores ──────────────────────────────────────────────────────

const supplierSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido"),
  contactName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional(),
});

export async function updateFoodSupplier(supplierId: string, data: z.input<typeof supplierSchema>) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = supplierSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos de proveedor inválidos");

  const supplier = await prisma.foodSupplier.findFirst({ where: { id: supplierId, organizationId }, select: { id: true } });
  if (!supplier) throw new UserError("Proveedor no encontrado");

  await prisma.foodSupplier.update({
    where: { id: supplierId },
    data: {
      name: parsed.data.name,
      contactName: parsed.data.contactName || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      notes: parsed.data.notes || null,
    },
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.supplier_update",
    resource: "FoodSupplier",
    resourceId: supplierId,
    metadata: { name: parsed.data.name },
  });
  revalidateSuppliers();
}

export async function setFoodSupplierActive(supplierId: string, isActive: boolean) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const supplier = await prisma.foodSupplier.findFirst({ where: { id: supplierId, organizationId }, select: { name: true } });
  if (!supplier) throw new UserError("Proveedor no encontrado");

  await prisma.foodSupplier.update({ where: { id: supplierId }, data: { isActive } });
  await logAudit({
    organizationId,
    userId: session.user.id,
    action: isActive ? "food.supplier_activate" : "food.supplier_deactivate",
    resource: "FoodSupplier",
    resourceId: supplierId,
    metadata: { name: supplier.name },
  });
  revalidateSuppliers();
}

/** Borra un proveedor sin compras. Con compras se rechaza: se desactiva para no perder de quién fue cada compra. */
export async function deleteFoodSupplier(supplierId: string) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const supplier = await prisma.foodSupplier.findFirst({
    where: { id: supplierId, organizationId },
    select: { name: true, _count: { select: { purchases: true } } },
  });
  if (!supplier) throw new UserError("Proveedor no encontrado");
  if (supplier._count.purchases > 0) throw new UserError("Este proveedor tiene compras registradas; desactívalo en lugar de eliminarlo");

  await prisma.foodSupplier.delete({ where: { id: supplierId } });
  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.supplier_delete",
    resource: "FoodSupplier",
    resourceId: supplierId,
    metadata: { name: supplier.name },
  });
  revalidateSuppliers();
}

function revalidateSuppliers() {
  revalidatePath("/portal/food/suppliers");
  revalidatePath("/portal/food/purchases");
  revalidatePath("/portal/food");
}

// ── Compras ──────────────────────────────────────────────────────────

const purchaseSchema = z.object({
  supplierId: z.string().nullable(),
  purchasedAt: z.string().min(1, "Fecha requerida"),
  notes: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().min(1, "Selecciona un insumo"),
        quantity: z.number().positive("Cantidad debe ser mayor a 0"),
        unitCost: z.number().min(0, "No puede ser negativo"),
      })
    )
    .min(1, "Agrega al menos un insumo"),
});

/**
 * Registra una compra: suma cada cantidad a la existencia del insumo y deja
 * el costo unitario pagado como su costo actual (último costo de compra),
 * que es el que usan recetas y rentabilidad.
 */
export async function createFoodPurchase(data: z.input<typeof purchaseSchema>) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = purchaseSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.errors[0]?.message ?? "Datos de compra inválidos");

  const purchasedAt = new Date(parsed.data.purchasedAt);
  if (Number.isNaN(purchasedAt.getTime())) throw new UserError("Fecha inválida");

  const itemIds = [...new Set(parsed.data.items.map((i) => i.inventoryItemId))];
  if (itemIds.length !== parsed.data.items.length) throw new UserError("Un insumo aparece dos veces en la compra");
  const owned = await prisma.foodInventoryItem.findMany({
    where: { id: { in: itemIds }, organizationId },
    select: { id: true, isActive: true, unitCost: true },
  });
  if (owned.length !== itemIds.length) throw new UserError("Uno o más insumos no son válidos");
  if (owned.some((i) => !i.isActive)) throw new UserError("Uno o más insumos están desactivados");
  if (parsed.data.supplierId) {
    const supplier = await prisma.foodSupplier.findFirst({ where: { id: parsed.data.supplierId, organizationId }, select: { isActive: true } });
    if (!supplier) throw new UserError("Proveedor no encontrado");
    if (!supplier.isActive) throw new UserError("Este proveedor está desactivado");
  }

  const total = Math.round(parsed.data.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0) * 100) / 100;

  const purchase = await prisma.$transaction(async (tx) => {
    // Costo vigente de cada insumo antes de esta compra, para regresarlo si se anula.
    const before = await tx.foodInventoryItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, unitCost: true } });
    const previousCost = new Map(before.map((i) => [i.id, i.unitCost]));
    const created = await tx.foodPurchase.create({
      data: {
        organizationId,
        supplierId: parsed.data.supplierId,
        purchasedAt,
        total,
        notes: parsed.data.notes || null,
        userId: session.user.id,
        items: {
          create: parsed.data.items.map((i) => ({
            inventoryItemId: i.inventoryItemId,
            quantity: i.quantity,
            unitCost: i.unitCost,
            previousUnitCost: previousCost.get(i.inventoryItemId) ?? null,
          })),
        },
      },
    });
    await applyStockMovements(
      tx,
      organizationId,
      parsed.data.items.map((i) => ({ inventoryItemId: i.inventoryItemId, delta: i.quantity })),
      { type: "PURCHASE", purchaseId: created.id, userId: session.user.id }
    );
    for (const i of parsed.data.items) {
      await tx.foodInventoryItem.update({ where: { id: i.inventoryItemId }, data: { unitCost: i.unitCost } });
    }
    return created;
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.purchase_create",
    resource: "FoodPurchase",
    resourceId: purchase.id,
    metadata: { total, items: parsed.data.items.length },
  });
  revalidateInventory();
  return { id: purchase.id };
}

/**
 * Anula una compra capturada por error: quita de la existencia lo que había
 * sumado y regresa el costo que tenía cada insumo antes de ella, salvo que
 * ese costo ya no sea el de esta compra (una compra posterior o una edición
 * manual lo cambió): entonces el costo vigente se respeta.
 */
export async function voidFoodPurchase(purchaseId: string, reason: string) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const trimmed = reason.trim();
  if (!trimmed) throw new UserError("Indica el motivo de la anulación");

  await prisma.$transaction(async (tx) => {
    const purchase = await tx.foodPurchase.findFirst({
      where: { id: purchaseId, organizationId },
      include: { items: true },
    });
    if (!purchase) throw new UserError("Compra no encontrada");
    if (purchase.voidedAt) throw new UserError("Esta compra ya está anulada");

    await tx.foodPurchase.update({ where: { id: purchaseId }, data: { voidedAt: new Date(), voidReason: trimmed } });
    await applyStockMovements(
      tx,
      organizationId,
      purchase.items.map((i) => ({ inventoryItemId: i.inventoryItemId, delta: -Number(i.quantity) })),
      { type: "PURCHASE_VOID", purchaseId, note: trimmed, userId: session.user.id }
    );
    for (const line of purchase.items) {
      const current = await tx.foodInventoryItem.findUnique({ where: { id: line.inventoryItemId }, select: { unitCost: true } });
      if (current?.unitCost === null || current?.unitCost === undefined || !current.unitCost.equals(line.unitCost)) continue;
      const later = await tx.foodPurchaseItem.count({
        where: {
          inventoryItemId: line.inventoryItemId,
          purchase: { organizationId, voidedAt: null, createdAt: { gt: purchase.createdAt } },
        },
      });
      if (later > 0) continue;
      await tx.foodInventoryItem.update({ where: { id: line.inventoryItemId }, data: { unitCost: line.previousUnitCost } });
    }
  });

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.purchase_void",
    resource: "FoodPurchase",
    resourceId: purchaseId,
    metadata: { reason: trimmed },
  });
  revalidateInventory();
}

// ── Recálculo por cambio de receta ───────────────────────────────────

/**
 * Vuelve a calcular el consumo de insumos de las ventas desde `since` con
 * las recetas actuales y corrige la existencia por la diferencia.
 */
export async function recalculateFoodRecipeUsage(since: string) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const sinceDate = new Date(since);
  if (!since || Number.isNaN(sinceDate.getTime())) throw new UserError("Fecha inválida");
  if (sinceDate.getTime() > Date.now()) throw new UserError("La fecha no puede ser futura");

  const result = await prisma.$transaction(
    (tx) => recalculateRecipeUsage(tx, organizationId, sinceDate, { note: sinceDate.toLocaleDateString("es-MX"), userId: session.user.id }),
    { timeout: 60_000 }
  );

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.recipe_recalculate",
    resource: "FoodRecipeUsage",
    metadata: { since, ...result },
  });
  revalidateInventory();
  return result;
}
