import { prisma } from "./prisma";

// ─── FOOD OPS — agregados de Ventas ──────────────────────────────────
// Compartido entre /portal/food (resumen) y /portal/food/analytics
// (detalle) -- mismo cálculo, no dos copias. Decimal de Prisma se
// convierte a number aquí, una sola vez, para que ninguna página tenga
// que acordarse de hacerlo.

export interface FoodSalesSummary {
  today: { gross: number; net: number; count: number };
  last7Days: { gross: number; net: number; count: number };
  last30Days: { gross: number; net: number; count: number };
  previous30Days: { gross: number; net: number; count: number };
  monthOverMonthGrossPct: number | null;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

async function sumRange(organizationId: string, from: Date, to?: Date) {
  const result = await prisma.foodSale.aggregate({
    where: {
      organizationId,
      occurredAt: to ? { gte: from, lt: to } : { gte: from },
    },
    _sum: { grossAmount: true, netAmount: true },
    _count: { _all: true },
  });

  return {
    gross: Number(result._sum.grossAmount ?? 0),
    net: Number(result._sum.netAmount ?? 0),
    count: result._count._all,
  };
}

export async function getFoodSalesSummary(organizationId: string): Promise<FoodSalesSummary> {
  const [today, last7Days, last30Days, previous30Days] = await Promise.all([
    sumRange(organizationId, startOfDay(new Date())),
    sumRange(organizationId, daysAgo(7)),
    sumRange(organizationId, daysAgo(30)),
    sumRange(organizationId, daysAgo(60), daysAgo(30)),
  ]);

  const monthOverMonthGrossPct =
    previous30Days.gross > 0
      ? Math.round(((last30Days.gross - previous30Days.gross) / previous30Days.gross) * 1000) / 10
      : null;

  return { today, last7Days, last30Days, previous30Days, monthOverMonthGrossPct };
}

export interface FoodSalesByChannel {
  channel: string;
  gross: number;
  count: number;
}

export async function getFoodSalesByChannel(organizationId: string): Promise<FoodSalesByChannel[]> {
  const rows = await prisma.foodSale.groupBy({
    by: ["channel"],
    where: { organizationId, occurredAt: { gte: daysAgo(30) } },
    _sum: { grossAmount: true },
    _count: { _all: true },
  });

  return rows
    .map((r) => ({
      channel: r.channel ?? "Sin canal",
      gross: Number(r._sum.grossAmount ?? 0),
      count: r._count._all,
    }))
    .sort((a, b) => b.gross - a.gross);
}
