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

// ─── FOOD OPS — Platillos y costeo (Fase 2: Rentabilidad) ────────────
// Fuente única del costo por platillo — todo lo demás en este bloque
// (punto de equilibrio, utilidad neta, insights, recomendaciones) llama a
// getFoodDishesWithCost() en vez de recalcular el costo por su cuenta.

export interface FoodDishIngredientLine {
  inventoryItemId: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  lineCost: number;
}

export interface FoodDishWithCost {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  cost: number;
  marginAmount: number;
  // null solo si price es 0 (el formulario exige > 0, pero un platillo
  // desactivado hace tiempo podría tener datos viejos) -- se evita dividir
  // entre cero en vez de mostrar un porcentaje sin sentido.
  marginPct: number | null;
  ingredients: FoodDishIngredientLine[];
}

export async function getFoodDishesWithCost(
  organizationId: string,
  opts: { activeOnly?: boolean } = {}
): Promise<FoodDishWithCost[]> {
  const dishes = await prisma.foodDish.findMany({
    where: { organizationId, ...(opts.activeOnly ? { isActive: true } : {}) },
    include: {
      ingredients: {
        include: { inventoryItem: { select: { name: true, unit: true, unitCost: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  return dishes.map((d) => {
    const ingredients: FoodDishIngredientLine[] = d.ingredients.map((i) => {
      const unitCost = Number(i.inventoryItem.unitCost ?? 0);
      const quantity = Number(i.quantity);
      return {
        inventoryItemId: i.inventoryItemId,
        name: i.inventoryItem.name,
        unit: i.inventoryItem.unit,
        quantity,
        unitCost,
        lineCost: Math.round(unitCost * quantity * 100) / 100,
      };
    });
    const cost = Math.round(ingredients.reduce((sum, i) => sum + i.lineCost, 0) * 100) / 100;
    const price = Number(d.price);
    const marginAmount = Math.round((price - cost) * 100) / 100;
    const marginPct = price > 0 ? Math.round((marginAmount / price) * 1000) / 10 : null;
    return { id: d.id, name: d.name, price, isActive: d.isActive, cost, marginAmount, marginPct, ingredients };
  });
}

// ─── FOOD OPS — Gastos fijos ──────────────────────────────────────────

export interface FoodOperatingCostEntry {
  id: string;
  name: string;
  amountMonthly: number;
  isActive: boolean;
}

export async function getFoodOperatingCosts(organizationId: string): Promise<FoodOperatingCostEntry[]> {
  const rows = await prisma.foodOperatingCost.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, amountMonthly: Number(r.amountMonthly), isActive: r.isActive }));
}

export async function getTotalMonthlyFixedCosts(organizationId: string): Promise<number> {
  const result = await prisma.foodOperatingCost.aggregate({
    where: { organizationId, isActive: true },
    _sum: { amountMonthly: true },
  });
  return Number(result._sum.amountMonthly ?? 0);
}

// ─── FOOD OPS — Punto de equilibrio ───────────────────────────────────

export interface FoodBreakEvenPerDish {
  dishId: string;
  name: string;
  price: number;
  cost: number;
  contributionMargin: number;
  // null si el margen de contribución es 0 o negativo -- ese platillo
  // nunca cubre los gastos fijos por sí solo, sin importar cuántos se
  // vendan (mostrar un número ahí sería engañoso, no solo impreciso).
  breakEvenUnits: number | null;
}

export interface FoodBreakEvenBlended {
  weightedAvgContributionMargin: number;
  breakEvenUnits: number;
  breakEvenRevenue: number;
  basedOnDays: number;
}

export interface FoodBreakEvenResult {
  fixedCostsMonthly: number;
  perDish: FoodBreakEvenPerDish[];
  // null cuando no hay ninguna venta por platillo registrada en los
  // últimos 30 días -- se omite en vez de inventar una mezcla de ventas.
  blended: FoodBreakEvenBlended | null;
}

export async function getFoodBreakEven(organizationId: string): Promise<FoodBreakEvenResult> {
  const [fixedCostsMonthly, dishes] = await Promise.all([
    getTotalMonthlyFixedCosts(organizationId),
    getFoodDishesWithCost(organizationId, { activeOnly: true }),
  ]);

  const perDish: FoodBreakEvenPerDish[] = dishes.map((d) => ({
    dishId: d.id,
    name: d.name,
    price: d.price,
    cost: d.cost,
    contributionMargin: d.marginAmount,
    breakEvenUnits: d.marginAmount > 0 ? Math.ceil(fixedCostsMonthly / d.marginAmount) : null,
  }));

  const since = daysAgo(30);
  const dishSales = await prisma.foodDishSale.groupBy({
    by: ["dishId"],
    where: { organizationId, occurredAt: { gte: since } },
    _sum: { quantity: true },
  });

  let blended: FoodBreakEvenBlended | null = null;
  if (dishSales.length > 0) {
    const dishById = new Map(dishes.map((d) => [d.id, d]));
    let totalUnits = 0;
    let totalMargin = 0;
    let totalRevenue = 0;
    for (const row of dishSales) {
      const dish = dishById.get(row.dishId);
      if (!dish) continue; // el platillo pudo desactivarse desde entonces
      const qty = row._sum.quantity ?? 0;
      totalUnits += qty;
      totalMargin += dish.marginAmount * qty;
      totalRevenue += dish.price * qty;
    }
    if (totalUnits > 0 && totalRevenue > 0) {
      const weightedAvgContributionMargin = totalMargin / totalUnits;
      const avgTicket = totalRevenue / totalUnits;
      if (weightedAvgContributionMargin > 0) {
        const breakEvenUnits = Math.ceil(fixedCostsMonthly / weightedAvgContributionMargin);
        blended = {
          weightedAvgContributionMargin: Math.round(weightedAvgContributionMargin * 100) / 100,
          breakEvenUnits,
          breakEvenRevenue: Math.round(breakEvenUnits * avgTicket * 100) / 100,
          basedOnDays: 30,
        };
      }
    }
  }

  return { fixedCostsMonthly, perDish, blended };
}

// ─── FOOD OPS — Utilidad neta ─────────────────────────────────────────
// Ingresos = FoodSale.netAmount (la fuente real ya existente, sin cambios).
// COGS = Σ FoodDishSale.quantity × costo del platillo, SOLO para platillos
// con venta registrada en el período -- coverage dice qué tan completo es
// ese dato para que la página pueda avisar si la utilidad es parcial.

export type FoodProfitPeriod = "today" | "7d" | "30d";

const PERIOD_LABEL_DAYS: Record<FoodProfitPeriod, number> = { today: 1, "7d": 7, "30d": 30 };

export interface FoodNetProfitResult {
  period: FoodProfitPeriod;
  revenue: number;
  cogs: number;
  fixedCostsProrated: number;
  netProfit: number;
  coverage: { dishesWithSales: number; totalActiveDishes: number };
}

export async function getFoodNetProfit(organizationId: string, period: FoodProfitPeriod): Promise<FoodNetProfitResult> {
  const days = PERIOD_LABEL_DAYS[period];
  const from = period === "today" ? startOfDay(new Date()) : daysAgo(days);

  const [salesAgg, dishSales, dishes, fixedCostsMonthly] = await Promise.all([
    prisma.foodSale.aggregate({
      where: { organizationId, occurredAt: { gte: from } },
      _sum: { netAmount: true },
    }),
    prisma.foodDishSale.groupBy({
      by: ["dishId"],
      where: { organizationId, occurredAt: { gte: from } },
      _sum: { quantity: true },
    }),
    getFoodDishesWithCost(organizationId, { activeOnly: true }),
    getTotalMonthlyFixedCosts(organizationId),
  ]);

  const dishById = new Map(dishes.map((d) => [d.id, d]));
  let cogs = 0;
  const dishesWithSalesIds = new Set<string>();
  for (const row of dishSales) {
    const dish = dishById.get(row.dishId);
    if (!dish) continue;
    cogs += dish.cost * (row._sum.quantity ?? 0);
    dishesWithSalesIds.add(row.dishId);
  }

  const revenue = Number(salesAgg._sum.netAmount ?? 0);
  const fixedCostsProrated = Math.round((fixedCostsMonthly / 30) * days * 100) / 100;
  const netProfit = Math.round((revenue - cogs - fixedCostsProrated) * 100) / 100;

  return {
    period,
    revenue,
    cogs: Math.round(cogs * 100) / 100,
    fixedCostsProrated,
    netProfit,
    coverage: { dishesWithSales: dishesWithSalesIds.size, totalActiveDishes: dishes.length },
  };
}

// ─── FOOD OPS — Reducción de costos ───────────────────────────────────

export interface FoodLowMarginDish {
  dishId: string;
  name: string;
  marginPct: number | null;
  cost: number;
  price: number;
}

export interface FoodTopCostIngredient {
  inventoryItemId: string;
  name: string;
  unit: string;
  // Suma del costo de este insumo por PORCIÓN a través de todas tus
  // recetas activas (no el gasto total de compra, que este módulo no
  // registra todavía) -- indica qué insumo pesa más en el costo de tu
  // menú, para saber qué negociar primero con proveedores.
  totalRecipeCost: number;
  usedInDishes: number;
}

export interface FoodCostReductionInsights {
  lowestMarginDishes: FoodLowMarginDish[];
  topCostIngredients: FoodTopCostIngredient[];
}

export async function getFoodCostReductionInsights(organizationId: string, limit = 5): Promise<FoodCostReductionInsights> {
  const dishes = await getFoodDishesWithCost(organizationId, { activeOnly: true });

  const lowestMarginDishes = [...dishes]
    .sort((a, b) => (a.marginPct ?? -Infinity) - (b.marginPct ?? -Infinity))
    .slice(0, limit)
    .map((d) => ({ dishId: d.id, name: d.name, marginPct: d.marginPct, cost: d.cost, price: d.price }));

  const ingredientTotals = new Map<string, { name: string; unit: string; totalRecipeCost: number; usedInDishes: Set<string> }>();
  for (const dish of dishes) {
    for (const ing of dish.ingredients) {
      const entry = ingredientTotals.get(ing.inventoryItemId) ?? {
        name: ing.name,
        unit: ing.unit,
        totalRecipeCost: 0,
        usedInDishes: new Set<string>(),
      };
      entry.totalRecipeCost += ing.lineCost;
      entry.usedInDishes.add(dish.id);
      ingredientTotals.set(ing.inventoryItemId, entry);
    }
  }

  const topCostIngredients = Array.from(ingredientTotals.entries())
    .map(([inventoryItemId, v]) => ({
      inventoryItemId,
      name: v.name,
      unit: v.unit,
      totalRecipeCost: Math.round(v.totalRecipeCost * 100) / 100,
      usedInDishes: v.usedInDishes.size,
    }))
    .sort((a, b) => b.totalRecipeCost - a.totalRecipeCost)
    .slice(0, limit);

  return { lowestMarginDishes, topCostIngredients };
}

// ─── FOOD OPS — Recomendaciones para mejorar utilidad ────────────────
// "Alto/bajo volumen" es relativo a la mediana de unidades vendidas del
// propio menú (últimos 30 días), no un número absoluto -- así aplica igual
// a un puesto chico que a una cadena, sin necesitar configuración.

export type FoodProfitRecommendationType = "review_urgent" | "raise_price_or_cut_cost" | "promote";

export interface FoodProfitRecommendation {
  type: FoodProfitRecommendationType;
  dishId: string;
  dishName: string;
  reason: string;
}

const LOW_MARGIN_PCT = 15;
const HIGH_MARGIN_PCT = 40;

export async function getFoodProfitRecommendations(organizationId: string): Promise<FoodProfitRecommendation[]> {
  const dishes = await getFoodDishesWithCost(organizationId, { activeOnly: true });
  if (dishes.length === 0) return [];

  const since = daysAgo(30);
  const salesRows = await prisma.foodDishSale.groupBy({
    by: ["dishId"],
    where: { organizationId, occurredAt: { gte: since } },
    _sum: { quantity: true },
  });
  const unitsByDish = new Map(salesRows.map((r) => [r.dishId, r._sum.quantity ?? 0]));

  const recommendations: FoodProfitRecommendation[] = [];

  for (const dish of dishes) {
    if (dish.marginAmount < 0) {
      recommendations.push({
        type: "review_urgent",
        dishId: dish.id,
        dishName: dish.name,
        reason: `Cuesta $${dish.cost.toFixed(2)} pero se vende en $${dish.price.toFixed(2)} — pierdes dinero en cada uno.`,
      });
    }
  }

  const soldDishes = dishes.filter((d) => (unitsByDish.get(d.id) ?? 0) > 0);
  if (soldDishes.length >= 2) {
    const unitsSorted = soldDishes.map((d) => unitsByDish.get(d.id) ?? 0).sort((a, b) => a - b);
    const median = unitsSorted[Math.floor(unitsSorted.length / 2)];
    for (const dish of soldDishes) {
      const units = unitsByDish.get(dish.id) ?? 0;
      if (dish.marginAmount >= 0 && dish.marginPct !== null && dish.marginPct < LOW_MARGIN_PCT && units >= median) {
        recommendations.push({
          type: "raise_price_or_cut_cost",
          dishId: dish.id,
          dishName: dish.name,
          reason: `Se vende bien (${units} en 30 días) pero deja solo ${dish.marginPct}% de margen — considera subir el precio o revisar la receta.`,
        });
      } else if (dish.marginPct !== null && dish.marginPct >= HIGH_MARGIN_PCT && units < median) {
        recommendations.push({
          type: "promote",
          dishId: dish.id,
          dishName: dish.name,
          reason: `Buen margen (${dish.marginPct}%) pero poca venta (${units} en 30 días) — es buen candidato para promocionar.`,
        });
      }
    }
  }

  return recommendations;
}

// ─── FOOD OPS — Platillos menos vendidos (para promociones) ─────────
// Solo entre platillos con AL MENOS una venta registrada en el rango, para
// no confundir "nunca se ofreció/no se ha capturado" con "se ofreció y
// casi no se vendió", que son situaciones muy distintas.

export interface FoodLeastSoldDish {
  dishId: string;
  name: string;
  unitsSold: number;
  price: number;
  marginPct: number | null;
}

export async function getFoodLeastSoldDishes(organizationId: string, days = 30, limit = 5): Promise<FoodLeastSoldDish[]> {
  const dishes = await getFoodDishesWithCost(organizationId, { activeOnly: true });
  const since = daysAgo(days);
  const salesRows = await prisma.foodDishSale.groupBy({
    by: ["dishId"],
    where: { organizationId, occurredAt: { gte: since } },
    _sum: { quantity: true },
  });
  const unitsByDish = new Map(salesRows.map((r) => [r.dishId, r._sum.quantity ?? 0]));

  return dishes
    .filter((d) => unitsByDish.has(d.id))
    .map((d) => ({ dishId: d.id, name: d.name, unitsSold: unitsByDish.get(d.id) ?? 0, price: d.price, marginPct: d.marginPct }))
    .sort((a, b) => a.unitsSold - b.unitsSold)
    .slice(0, limit);
}

// ─── FOOD OPS — Recomendación de precio ──────────────────────────────
// Método estándar de la industria restaurantera: precio = costo ÷ % de
// costo objetivo (ej. costo $30, objetivo 30% ⇒ precio sugerido $100).

export function recommendDishPrice(cost: number, targetCostPct: number): number {
  if (targetCostPct <= 0 || targetCostPct >= 100) return cost;
  return Math.round((cost / (targetCostPct / 100)) * 100) / 100;
}
