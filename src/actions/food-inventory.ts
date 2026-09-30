"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireFoodManager } from "@/lib/guards";
import { applyStockMovements } from "@/lib/food-inventory";
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
  const owned = await prisma.foodInventoryItem.count({ where: { id: { in: itemIds }, organizationId } });
  if (owned !== itemIds.length) throw new UserError("Uno o más insumos no son válidos");
  if (parsed.data.supplierId) {
    const supplier = await prisma.foodSupplier.count({ where: { id: parsed.data.supplierId, organizationId } });
    if (!supplier) throw new UserError("Proveedor no encontrado");
  }

  const total = Math.round(parsed.data.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0) * 100) / 100;

  const purchase = await prisma.$transaction(async (tx) => {
    const created = await tx.foodPurchase.create({
      data: {
        organizationId,
        supplierId: parsed.data.supplierId,
        purchasedAt,
        total,
        notes: parsed.data.notes || null,
        userId: session.user.id,
        items: {
          create: parsed.data.items.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity, unitCost: i.unitCost })),
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

/** Anula una compra capturada por error: quita de la existencia lo que había sumado. No regresa el costo anterior. */
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
