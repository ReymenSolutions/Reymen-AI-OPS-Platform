import { prisma } from "./prisma";

/**
 * Borra ventas del POS de un rango de días -- pensado para limpiar las
 * ventas de prueba de un negocio antes de arrancar. Deshace exactamente lo
 * que hizo cada venta al llegar (processFoodPosOrder):
 *   - regresa al inventario lo que descontó su receta (FoodRecipeUsage.applied,
 *     que ya incluye cualquier recálculo posterior),
 *   - resta sus unidades de los conteos de platillos y modificadores del día,
 *   - borra la venta, sus movimientos de inventario y su registro de receta.
 * Las ventas capturadas a mano (source MANUAL) no se tocan.
 */

export interface PosSalesPurgeSummary {
  sales: number;
  grossAmount: number;
  units: number;
  inventoryItems: number;
  firstAt: string | null;
  lastAt: string | null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

/** Mismo "día de negocio" que el webhook del POS (medianoche, hora del servidor). */
function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function parseDay(day: string): Date {
  if (!DAY_RE.test(day)) throw new Error("Fecha inválida");
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) throw new Error("Fecha inválida");
  return date;
}

/** [desde 00:00, día siguiente a "hasta" 00:00), ambos días incluidos. */
export function purgeRange(from: string, to: string): { gte: Date; lt: Date } {
  const gte = parseDay(from);
  const last = parseDay(to);
  if (last < gte) throw new Error("La fecha final es anterior a la inicial");
  const lt = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
  if ((lt.getTime() - gte.getTime()) / 86_400_000 > MAX_DAYS) throw new Error("El rango no puede ser mayor a un año");
  return { gte, lt };
}

type Db = Pick<typeof prisma, "foodSale" | "foodRecipeUsage">;

async function collect(db: Db, organizationId: string, range: { gte: Date; lt: Date }) {
  const sales = await db.foodSale.findMany({
    where: { organizationId, source: "POS", occurredAt: range },
    select: { id: true, grossAmount: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });
  const usages = sales.length
    ? await db.foodRecipeUsage.findMany({
        where: { organizationId, foodSaleId: { in: sales.map((s) => s.id) } },
        select: { id: true, variantId: true, modifierOptionId: true, units: true, occurredAt: true, applied: true },
      })
    : [];
  const stockBack = new Map<string, number>();
  for (const u of usages) {
    for (const [itemId, used] of Object.entries((u.applied ?? {}) as Record<string, number>)) {
      stockBack.set(itemId, (stockBack.get(itemId) ?? 0) + Number(used));
    }
  }
  const summary: PosSalesPurgeSummary = {
    sales: sales.length,
    grossAmount: Math.round(sales.reduce((n, s) => n + Number(s.grossAmount), 0) * 100) / 100,
    units: usages.filter((u) => u.variantId).reduce((n, u) => n + Number(u.units), 0),
    inventoryItems: [...stockBack.values()].filter((v) => Math.round(v * 1000) !== 0).length,
    firstAt: sales[0]?.occurredAt.toISOString() ?? null,
    lastAt: sales.at(-1)?.occurredAt.toISOString() ?? null,
  };
  return { sales, usages, stockBack, summary };
}

export async function previewPosSalesPurge(organizationId: string, from: string, to: string): Promise<PosSalesPurgeSummary> {
  return (await collect(prisma, organizationId, purgeRange(from, to))).summary;
}

export async function purgePosSales(organizationId: string, from: string, to: string): Promise<PosSalesPurgeSummary> {
  const range = purgeRange(from, to);
  return prisma.$transaction(
    async (tx) => {
      const { sales, usages, stockBack, summary } = await collect(tx, organizationId, range);
      if (sales.length === 0) return summary;
      const saleIds = sales.map((s) => s.id);

      for (const [inventoryItemId, qty] of stockBack) {
        const rounded = Math.round(qty * 1000) / 1000;
        if (rounded === 0) continue;
        // updateMany: un insumo borrado después de la venta simplemente no está.
        await tx.foodInventoryItem.updateMany({ where: { id: inventoryItemId, organizationId }, data: { currentStock: { increment: rounded } } });
      }

      const touchedDays = new Set<number>();
      for (const u of usages) {
        const units = Math.round(Number(u.units));
        if (units === 0) continue;
        const occurredAt = startOfDay(u.occurredAt);
        touchedDays.add(occurredAt.getTime());
        if (u.variantId) {
          await tx.foodDishSale.updateMany({ where: { organizationId, variantId: u.variantId, occurredAt }, data: { quantity: { decrement: units } } });
        } else if (u.modifierOptionId) {
          await tx.foodModifierOptionSale.updateMany({
            where: { organizationId, optionId: u.modifierOptionId, occurredAt },
            data: { quantity: { decrement: units } },
          });
        }
      }
      // Un día que solo tuvo ventas de prueba queda en 0: sin fila.
      const days = [...touchedDays].map((t) => new Date(t));
      if (days.length) {
        await tx.foodDishSale.deleteMany({ where: { organizationId, occurredAt: { in: days }, quantity: 0 } });
        await tx.foodModifierOptionSale.deleteMany({ where: { organizationId, occurredAt: { in: days }, quantity: 0 } });
      }

      await tx.foodInventoryMovement.deleteMany({ where: { organizationId, foodSaleId: { in: saleIds } } });
      await tx.foodRecipeUsage.deleteMany({ where: { organizationId, foodSaleId: { in: saleIds } } });
      await tx.foodSale.deleteMany({ where: { organizationId, id: { in: saleIds } } });
      return summary;
    },
    { timeout: 60_000 },
  );
}
