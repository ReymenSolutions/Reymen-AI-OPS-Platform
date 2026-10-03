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

type Consumption = Record<string, number>;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

type Recipe = { inventoryItemId: string; quantity: number }[];

function groupRecipe<K extends string>(lines: ({ inventoryItemId: string; quantity: Prisma.Decimal } & Record<K, string>)[], key: K) {
  const out = new Map<string, Recipe>();
  for (const line of lines) {
    const list = out.get(line[key]) ?? [];
    list.push({ inventoryItemId: line.inventoryItemId, quantity: Number(line.quantity) });
    out.set(line[key], list);
  }
  return out;
}

/** Recetas actuales de variantes y de opciones de modificador. */
async function loadRecipes(tx: Tx, variantIds: string[], optionIds: string[]) {
  const [variantLines, optionLines] = await Promise.all([
    variantIds.length
      ? tx.foodDishVariantIngredient.findMany({
          where: { variantId: { in: variantIds } },
          select: { variantId: true, inventoryItemId: true, quantity: true },
        })
      : [],
    optionIds.length
      ? tx.foodModifierOptionIngredient.findMany({
          where: { optionId: { in: optionIds } },
          select: { optionId: true, inventoryItemId: true, quantity: true },
        })
      : [],
  ]);
  return { variants: groupRecipe(variantLines, "variantId"), options: groupRecipe(optionLines, "optionId") };
}

/** Lo que consumen `units` unidades con esta receta (unidades negativas devuelven). */
function consumptionFor(recipe: Recipe | undefined, units: number): Consumption {
  const out: Consumption = {};
  for (const line of recipe ?? []) {
    const used = round3(line.quantity * units);
    if (used !== 0) out[line.inventoryItemId] = round3((out[line.inventoryItemId] ?? 0) + used);
  }
  return out;
}

function sumBy<T>(items: T[], key: (i: T) => string, qty: (i: T) => number): Map<string, number> {
  const out = new Map<string, number>();
  for (const i of items) out.set(key(i), (out.get(key(i)) ?? 0) + qty(i));
  return out;
}

/**
 * Descuenta los insumos de lo vendido según la receta ACTUAL de cada
 * variante y de cada opción de modificador ("Extra queso"), y deja un
 * FoodRecipeUsage por variante/opción con lo descontado, para poder
 * recalcular después si la receta cambia. Unidades negativas (una
 * cancelación o una corrección a la baja) devuelven insumos.
 */
export async function consumeRecipes(
  tx: Tx,
  organizationId: string,
  sold: { variants: { variantId: string; quantity: number }[]; modifiers?: { optionId: string; quantity: number }[] },
  meta: {
    type: Extract<FoodInventoryMovementType, "SALE" | "SALE_CANCELLATION" | "MANUAL_DISH_SALES">;
    occurredAt: Date;
    foodSaleId?: string;
    note?: string;
    userId?: string | null;
  }
): Promise<void> {
  const unitsByVariant = sumBy(sold.variants, (i) => i.variantId, (i) => i.quantity);
  const unitsByOption = sumBy(sold.modifiers ?? [], (m) => m.optionId, (m) => m.quantity);
  const recipes = await loadRecipes(tx, [...unitsByVariant.keys()], [...unitsByOption.keys()]);

  const total = new Map<string, number>();
  const record = async (source: { variantId: string } | { modifierOptionId: string }, recipe: Recipe | undefined, units: number) => {
    if (units === 0) return;
    const applied = consumptionFor(recipe, units);
    // También sin receta: si después se le agrega una, el recálculo la alcanza.
    await tx.foodRecipeUsage.create({
      data: { organizationId, ...source, units, occurredAt: meta.occurredAt, type: meta.type, foodSaleId: meta.foodSaleId ?? null, applied },
    });
    for (const [itemId, used] of Object.entries(applied)) total.set(itemId, (total.get(itemId) ?? 0) + used);
  };
  for (const [variantId, units] of unitsByVariant) await record({ variantId }, recipes.variants.get(variantId), units);
  for (const [optionId, units] of unitsByOption) await record({ modifierOptionId: optionId }, recipes.options.get(optionId), units);

  await applyStockMovements(tx, organizationId, consumptionToDeltas(total), meta);
}

/**
 * Recalcula con las recetas ACTUALES (de platillos y de modificadores) las
 * ventas desde `since`: por cada FoodRecipeUsage compara lo que se descontó
 * con lo que indica la receta hoy y mueve solo la diferencia (un movimiento
 * RECIPE_RECALC por insumo). Correrlo dos veces no cambia nada la segunda vez.
 */
export async function recalculateRecipeUsage(
  tx: Tx,
  organizationId: string,
  since: Date,
  meta: { note?: string; userId?: string | null }
): Promise<{ usages: number; items: number }> {
  const usages = await tx.foodRecipeUsage.findMany({
    where: { organizationId, occurredAt: { gte: since } },
    select: { id: true, variantId: true, modifierOptionId: true, units: true, applied: true },
  });
  const recipes = await loadRecipes(
    tx,
    [...new Set(usages.flatMap((u) => (u.variantId ? [u.variantId] : [])))],
    [...new Set(usages.flatMap((u) => (u.modifierOptionId ? [u.modifierOptionId] : [])))]
  );

  const diff = new Map<string, number>();
  let changed = 0;
  for (const usage of usages) {
    const recipe = usage.variantId ? recipes.variants.get(usage.variantId) : recipes.options.get(usage.modifierOptionId!);
    const expected = consumptionFor(recipe, Number(usage.units));
    const applied = (usage.applied ?? {}) as Consumption;
    let differs = false;
    for (const itemId of new Set([...Object.keys(expected), ...Object.keys(applied)])) {
      const d = round3((expected[itemId] ?? 0) - Number(applied[itemId] ?? 0));
      if (d === 0) continue;
      differs = true;
      diff.set(itemId, (diff.get(itemId) ?? 0) + d);
    }
    if (differs) {
      changed++;
      await tx.foodRecipeUsage.update({ where: { id: usage.id }, data: { applied: expected } });
    }
  }

  const deltas = consumptionToDeltas(diff).filter((d) => round3(d.delta) !== 0);
  await applyStockMovements(tx, organizationId, deltas, { type: "RECIPE_RECALC", note: meta.note, userId: meta.userId });
  return { usages: changed, items: deltas.length };
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
    batchId?: string;
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
        batchId: meta.batchId ?? null,
        note: meta.note ?? null,
        userId: meta.userId ?? null,
      },
    });
  }
}

/** Convierte un consumo (lo que se gasta) en cambios de existencia (lo gastado resta). */
function consumptionToDeltas(consumption: Map<string, number>): StockDelta[] {
  return [...consumption.entries()].map(([inventoryItemId, used]) => ({ inventoryItemId, delta: -used }));
}
