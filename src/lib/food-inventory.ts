import type { FoodInventoryMovementType, Prisma } from "@prisma/client";

// ─── FOOD OPS — Existencias de insumos ───────────────────────────────
// Único lugar que cambia FoodInventoryItem.currentStock: cada cambio deja un
// FoodInventoryMovement con su motivo y la existencia resultante. Se llama
// dentro de la transacción de quien lo origina (venta del POS, compra,
// ajuste), para que la existencia y el hecho que la movió nunca queden a
// medias.

type Tx = Prisma.TransactionClient;

export interface StockDelta {
  inventoryItemId: string;
  /** Con signo: negativo resta, positivo suma. */
  delta: number;
}

/**
 * Insumos que consumen estas unidades vendidas según la receta ACTUAL de
 * cada variante (FoodDishVariantIngredient). Unidades negativas (una
 * cancelación) dan consumo negativo, o sea, devuelven insumos.
 */
export async function recipeConsumption(
  tx: Tx,
  items: { variantId: string; quantity: number }[]
): Promise<Map<string, number>> {
  const variantIds = [...new Set(items.map((i) => i.variantId))];
  if (variantIds.length === 0) return new Map();
  const lines = await tx.foodDishVariantIngredient.findMany({
    where: { variantId: { in: variantIds } },
    select: { variantId: true, inventoryItemId: true, quantity: true },
  });
  const consumption = new Map<string, number>();
  for (const item of items) {
    for (const line of lines) {
      if (line.variantId !== item.variantId) continue;
      const used = Number(line.quantity) * item.quantity;
      consumption.set(line.inventoryItemId, (consumption.get(line.inventoryItemId) ?? 0) + used);
    }
  }
  return consumption;
}

/** Aplica los cambios de existencia y registra un movimiento por insumo. */
export async function applyStockMovements(
  tx: Tx,
  organizationId: string,
  deltas: StockDelta[],
  meta: {
    type: FoodInventoryMovementType;
    foodSaleId?: string;
    purchaseId?: string;
    note?: string;
    userId?: string | null;
  }
): Promise<void> {
  for (const { inventoryItemId, delta } of deltas) {
    const rounded = Math.round(delta * 1000) / 1000;
    if (rounded === 0) continue;
    // La existencia puede quedar negativa: nunca se bloquea una venta por
    // inventario; un negativo es la señal de que falta registrar una compra
    // o hacer un conteo.
    const updated = await tx.foodInventoryItem.update({
      where: { id: inventoryItemId, organizationId },
      data: { currentStock: { increment: rounded } },
      select: { currentStock: true },
    });
    await tx.foodInventoryMovement.create({
      data: {
        organizationId,
        inventoryItemId,
        type: meta.type,
        quantity: rounded,
        stockAfter: updated.currentStock,
        foodSaleId: meta.foodSaleId ?? null,
        purchaseId: meta.purchaseId ?? null,
        note: meta.note ?? null,
        userId: meta.userId ?? null,
      },
    });
  }
}

/** Convierte un consumo (lo que se gasta) en cambios de existencia (lo gastado resta). */
export function consumptionToDeltas(consumption: Map<string, number>): StockDelta[] {
  return [...consumption.entries()].map(([inventoryItemId, used]) => ({ inventoryItemId, delta: -used }));
}
