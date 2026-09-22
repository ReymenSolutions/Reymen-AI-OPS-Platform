import { prisma } from "./prisma";

// ─── FOOD OPS — agregados de Ventas ──────────────────────────────────
// Compartido entre /portal/food (resumen) y /portal/food/analytics
// (detalle) -- mismo cálculo, no dos copias. Decimal de Prisma se
// convierte a number aquí, una sola vez, para que ninguna página tenga
// que acordarse de hacerlo.

export interface FoodSalesSummary {
  today: { gross: number; net: number; count: number };
  yesterday: { gross: number; net: number; count: number };
  last7Days: { gross: number; net: number; count: number };
  last30Days: { gross: number; net: number; count: number };
  previous30Days: { gross: number; net: number; count: number };
  monthOverMonthGrossPct: number | null;
  // Mismo criterio que monthOverMonthGrossPct (30 días vs. los 30 previos),
  // agregado 2026-09-21 para el resumen del dashboard de restaurante — no
  // dispara ninguna consulta nueva, solo deriva de last30Days/previous30Days
  // que ya se traían.
  monthOverMonthOrdersPct: number | null;
  monthOverMonthTicketPct: number | null;
  // "vs ayer" -- comparación día contra día, agregada 2026-09-21 para los
  // KPIs superiores del dashboard (el mockup de referencia del cliente pide
  // "vs ayer" ahí, no "vs 30 días previos"). Un día es una muestra chica y
  // ruidosa, pero es la comparación real que se pidió, no una inventada.
  vsYesterdayGrossPct: number | null;
  vsYesterdayOrdersPct: number | null;
  vsYesterdayTicketPct: number | null;
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
  const [today, yesterday, last7Days, last30Days, previous30Days] = await Promise.all([
    sumRange(organizationId, startOfDay(new Date())),
    sumRange(organizationId, daysAgo(1), startOfDay(new Date())),
    sumRange(organizationId, daysAgo(7)),
    sumRange(organizationId, daysAgo(30)),
    sumRange(organizationId, daysAgo(60), daysAgo(30)),
  ]);

  const pctChange = (curr: number, prev: number): number | null =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : null;

  const monthOverMonthGrossPct = pctChange(last30Days.gross, previous30Days.gross);
  const monthOverMonthOrdersPct = pctChange(last30Days.count, previous30Days.count);
  const ticket30 = last30Days.count > 0 ? last30Days.gross / last30Days.count : 0;
  const ticketPrev30 = previous30Days.count > 0 ? previous30Days.gross / previous30Days.count : 0;
  const monthOverMonthTicketPct = pctChange(ticket30, ticketPrev30);

  const vsYesterdayGrossPct = pctChange(today.gross, yesterday.gross);
  const vsYesterdayOrdersPct = pctChange(today.count, yesterday.count);
  const ticketToday = today.count > 0 ? today.gross / today.count : 0;
  const ticketYesterday = yesterday.count > 0 ? yesterday.gross / yesterday.count : 0;
  const vsYesterdayTicketPct = pctChange(ticketToday, ticketYesterday);

  return {
    today,
    yesterday,
    last7Days,
    last30Days,
    previous30Days,
    monthOverMonthGrossPct,
    monthOverMonthOrdersPct,
    monthOverMonthTicketPct,
    vsYesterdayGrossPct,
    vsYesterdayOrdersPct,
    vsYesterdayTicketPct,
  };
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

// ─── FOOD OPS — ventas por hora (dashboard) ──────────────────────────
// Sin GROUP BY portable por hora en Prisma sobre Postgres sin SQL crudo,
// así que se trae el día completo (siempre acotado a un solo día, volumen
// bajo) y se agrega por hora en JS — mismo criterio que
// getCompanyCardStats en smartcard-company.ts para el desglose por tipo.

export interface FoodHourlyBucket {
  hour: number; // 0-23, hora local del servidor (mismo criterio que startOfDay/daysAgo arriba)
  gross: number;
  count: number;
}

export async function getFoodHourlySales(organizationId: string): Promise<FoodHourlyBucket[]> {
  const sales = await prisma.foodSale.findMany({
    where: { organizationId, occurredAt: { gte: startOfDay(new Date()) } },
    select: { occurredAt: true, grossAmount: true },
  });

  const buckets = new Map<number, { gross: number; count: number }>();
  for (const sale of sales) {
    const hour = sale.occurredAt.getHours();
    const entry = buckets.get(hour) ?? { gross: 0, count: 0 };
    entry.gross += Number(sale.grossAmount);
    entry.count += 1;
    buckets.set(hour, entry);
  }

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    gross: buckets.get(hour)?.gross ?? 0,
    count: buckets.get(hour)?.count ?? 0,
  }));
}

// ─── FOOD OPS — insumos con stock bajo (dashboard) ───────────────────
// Prisma no compara dos columnas de la misma tabla directo en `where`, así
// que se filtra en JS -- mismo criterio ya usado en
// portal/food/inventory/page.tsx (no se duplica la query completa de esa
// página, solo su misma regla de negocio, aquí acotada a los más urgentes).

export interface FoodLowStockEntry {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minStock: number;
}

export async function getFoodLowStockItems(organizationId: string, limit = 5): Promise<FoodLowStockEntry[]> {
  const items = await prisma.foodInventoryItem.findMany({
    where: { organizationId },
    select: { id: true, name: true, unit: true, currentStock: true, minStock: true },
  });

  return items
    .map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      currentStock: Number(i.currentStock),
      minStock: Number(i.minStock),
    }))
    .filter((i) => i.currentStock <= i.minStock)
    // Más urgente primero: el que está más por debajo de su propio mínimo
    // (en términos relativos, no absolutos, para no sesgar por unidad).
    .sort((a, b) => a.currentStock / Math.max(a.minStock, 1) - b.currentStock / Math.max(b.minStock, 1))
    .slice(0, limit);
}

// ─── FOOD OPS — ventas por día (sparklines del dashboard) ────────────
// Mismo criterio que getFoodHourlySales (se trae el rango completo y se
// agrega en JS), pero por día en vez de por hora -- agregado 2026-09-21
// específicamente para alimentar los mini-sparklines de los KPIs
// superiores con una serie real de los últimos N días, no inventada.

export interface FoodDailyBucket {
  date: string; // YYYY-MM-DD, hora local del servidor (mismo criterio que el resto del archivo)
  gross: number;
  count: number;
}

export async function getFoodDailySales(organizationId: string, days = 7): Promise<FoodDailyBucket[]> {
  const from = daysAgo(days - 1);
  const sales = await prisma.foodSale.findMany({
    where: { organizationId, occurredAt: { gte: from } },
    select: { occurredAt: true, grossAmount: true },
  });

  const toKey = (d: Date) => startOfDay(d).toISOString().slice(0, 10);

  const buckets = new Map<string, { gross: number; count: number }>();
  for (const sale of sales) {
    const key = toKey(sale.occurredAt);
    const entry = buckets.get(key) ?? { gross: 0, count: 0 };
    entry.gross += Number(sale.grossAmount);
    entry.count += 1;
    buckets.set(key, entry);
  }

  return Array.from({ length: days }, (_, i) => {
    const key = toKey(daysAgo(days - 1 - i));
    return { date: key, gross: buckets.get(key)?.gross ?? 0, count: buckets.get(key)?.count ?? 0 };
  });
}
