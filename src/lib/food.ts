import { prisma } from "./prisma";
import { hasModule } from "./modules";

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

// ─── FOOD OPS — Platillos, variantes y costeo (Fase 2: Rentabilidad) ─
// Un FoodDish es el producto de menú ("Berry Bloom"); cada FoodDishVariant
// es una presentación vendible con su propio precio y su propia receta
// ("Chico"/"Grande", o DEFAULT_VARIANT_LABEL si el platillo no maneja
// tamaños). getFoodDishesWithCost() es la fuente única del costo por
// variante — todo lo demás en este bloque (punto de equilibrio, utilidad
// neta, insights, recomendaciones) llama a esta función (vía
// flattenVariants) en vez de recalcular el costo por su cuenta.

export const DEFAULT_VARIANT_LABEL = "Único";

export interface FoodDishIngredientLine {
  inventoryItemId: string;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  lineCost: number;
}

export interface FoodDishVariantWithCost {
  id: string;
  dishId: string;
  label: string;
  price: number;
  cost: number;
  marginAmount: number;
  // null solo si price es 0 (el formulario exige > 0, pero una variante
  // desactivada hace tiempo podría tener datos viejos) -- se evita dividir
  // entre cero en vez de mostrar un porcentaje sin sentido.
  marginPct: number | null;
  ingredients: FoodDishIngredientLine[];
  // "Berry Bloom — Grande", o solo "Café Americano" cuando el platillo
  // tiene una única variante con el label por defecto -- para no mostrar
  // "Café Americano — Único" en ningún lado de la UI.
  displayName: string;
}

export interface FoodDishWithCost {
  id: string;
  name: string;
  isActive: boolean;
  categoryId: string | null;
  categoryName: string | null;
  modifierGroupIds: string[];
  variants: FoodDishVariantWithCost[];
}

export async function getFoodDishesWithCost(
  organizationId: string,
  opts: { activeOnly?: boolean } = {}
): Promise<FoodDishWithCost[]> {
  const dishes = await prisma.foodDish.findMany({
    where: { organizationId, ...(opts.activeOnly ? { isActive: true } : {}) },
    include: {
      category: { select: { id: true, name: true } },
      modifierGroups: { select: { groupId: true } },
      variants: {
        include: {
          ingredients: {
            include: { inventoryItem: { select: { name: true, unit: true, unitCost: true } } },
          },
        },
        orderBy: { label: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return dishes.map((d) => {
    const singleDefaultVariant = d.variants.length === 1 && d.variants[0].label === DEFAULT_VARIANT_LABEL;
    const variants: FoodDishVariantWithCost[] = d.variants.map((v) => {
      const ingredients: FoodDishIngredientLine[] = v.ingredients.map((i) => {
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
      const price = Number(v.price);
      const marginAmount = Math.round((price - cost) * 100) / 100;
      const marginPct = price > 0 ? Math.round((marginAmount / price) * 1000) / 10 : null;
      return {
        id: v.id,
        dishId: d.id,
        label: v.label,
        price,
        cost,
        marginAmount,
        marginPct,
        ingredients,
        displayName: singleDefaultVariant ? d.name : `${d.name} — ${v.label}`,
      };
    });
    return {
      id: d.id,
      name: d.name,
      isActive: d.isActive,
      categoryId: d.category?.id ?? null,
      categoryName: d.category?.name ?? null,
      modifierGroupIds: d.modifierGroups.map((m) => m.groupId),
      variants,
    };
  });
}

/** Aplana platillos→variantes en una sola lista — la unidad real de precio/costo/venta. */
export function flattenVariants(dishes: FoodDishWithCost[]): FoodDishVariantWithCost[] {
  return dishes.flatMap((d) => d.variants);
}

// ─── FOOD OPS — Menú para consumo externo (POS u otros integradores) ──
// Proyección liviana (sin costo/ingredientes) pensada para un futuro POS:
// solo lo que necesita para vender y para mapear su catálogo al nuestro
// vía externalPosId. No reutiliza getFoodDishesWithCost() a propósito --
// ese trae el join de insumos completo, que un consumidor de menú no
// necesita.

export interface FoodMenuVariant {
  variantId: string;
  label: string;
  price: number;
  externalPosId: string | null;
}

export interface FoodMenuModifierOption {
  optionId: string;
  name: string;
  priceDelta: number;
}

export interface FoodMenuModifierGroup {
  groupId: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: FoodMenuModifierOption[];
}

export interface FoodMenuDish {
  dishId: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  variants: FoodMenuVariant[];
  modifierGroups: FoodMenuModifierGroup[];
}

export async function getFoodMenuForPos(organizationId: string): Promise<FoodMenuDish[]> {
  const dishes = await prisma.foodDish.findMany({
    where: { organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      category: { select: { id: true, name: true } },
      variants: {
        select: { id: true, label: true, price: true, externalPosId: true },
        orderBy: { label: "asc" },
      },
      modifierGroups: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
              minSelect: true,
              maxSelect: true,
              sortOrder: true,
              options: { select: { id: true, name: true, priceDelta: true }, orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return dishes.map((d) => ({
    dishId: d.id,
    name: d.name,
    categoryId: d.category?.id ?? null,
    categoryName: d.category?.name ?? null,
    variants: d.variants.map((v) => ({
      variantId: v.id,
      label: v.label,
      price: Number(v.price),
      externalPosId: v.externalPosId,
    })),
    modifierGroups: d.modifierGroups
      .map((link) => link.group)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({
        groupId: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        options: g.options.map((o) => ({ optionId: o.id, name: o.name, priceDelta: Number(o.priceDelta) })),
      })),
  }));
}

// ─── FOOD OPS — Categorías de menú (Fase 17) ─────────────────────────

export interface FoodDishCategoryEntry {
  id: string;
  name: string;
  sortOrder: number;
  dishCount: number;
}

export async function getFoodDishCategories(organizationId: string): Promise<FoodDishCategoryEntry[]> {
  const rows = await prisma.foodDishCategory.findMany({
    where: { organizationId },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { dishes: true } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder, dishCount: c._count.dishes }));
}

// ─── FOOD OPS — Grupos de modificadores (Fase 17) ────────────────────

export interface FoodModifierOptionEntry {
  id: string;
  name: string;
  priceDelta: number;
}

export interface FoodModifierGroupEntry {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
  options: FoodModifierOptionEntry[];
  dishCount: number;
}

export async function getFoodModifierGroups(organizationId: string): Promise<FoodModifierGroupEntry[]> {
  const rows = await prisma.foodModifierGroup.findMany({
    where: { organizationId },
    orderBy: { sortOrder: "asc" },
    include: {
      options: { orderBy: { sortOrder: "asc" } },
      _count: { select: { dishLinks: true } },
    },
  });
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    sortOrder: g.sortOrder,
    options: g.options.map((o) => ({ id: o.id, name: o.name, priceDelta: Number(o.priceDelta) })),
    dishCount: g._count.dishLinks,
  }));
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

export interface FoodBreakEvenPerVariant {
  variantId: string;
  dishId: string;
  name: string;
  price: number;
  cost: number;
  contributionMargin: number;
  // null si el margen de contribución es 0 o negativo -- esa variante
  // nunca cubre los gastos fijos por sí sola, sin importar cuántas se
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
  perVariant: FoodBreakEvenPerVariant[];
  // null cuando no hay ninguna venta registrada en los últimos 30 días --
  // se omite en vez de inventar una mezcla de ventas.
  blended: FoodBreakEvenBlended | null;
}

export async function getFoodBreakEven(organizationId: string): Promise<FoodBreakEvenResult> {
  const [fixedCostsMonthly, dishes] = await Promise.all([
    getTotalMonthlyFixedCosts(organizationId),
    getFoodDishesWithCost(organizationId, { activeOnly: true }),
  ]);
  const variants = flattenVariants(dishes);

  const perVariant: FoodBreakEvenPerVariant[] = variants.map((v) => ({
    variantId: v.id,
    dishId: v.dishId,
    name: v.displayName,
    price: v.price,
    cost: v.cost,
    contributionMargin: v.marginAmount,
    breakEvenUnits: v.marginAmount > 0 ? Math.ceil(fixedCostsMonthly / v.marginAmount) : null,
  }));

  const since = daysAgo(30);
  const variantSales = await prisma.foodDishSale.groupBy({
    by: ["variantId"],
    where: { organizationId, occurredAt: { gte: since } },
    _sum: { quantity: true },
  });

  let blended: FoodBreakEvenBlended | null = null;
  if (variantSales.length > 0) {
    const variantById = new Map(variants.map((v) => [v.id, v]));
    let totalUnits = 0;
    let totalMargin = 0;
    let totalRevenue = 0;
    for (const row of variantSales) {
      const variant = variantById.get(row.variantId);
      if (!variant) continue; // la variante pudo desactivarse/borrarse desde entonces
      const qty = row._sum.quantity ?? 0;
      totalUnits += qty;
      totalMargin += variant.marginAmount * qty;
      totalRevenue += variant.price * qty;
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

  return { fixedCostsMonthly, perVariant, blended };
}

// ─── FOOD OPS — Utilidad neta ─────────────────────────────────────────
// Ingresos = FoodSale.netAmount (la fuente real ya existente, sin cambios).
// COGS = Σ FoodDishSale.quantity × costo de la variante, SOLO para
// variantes con venta registrada en el período -- coverage dice qué tan
// completo es ese dato para que la página pueda avisar si la utilidad es
// parcial.

export type FoodProfitPeriod = "today" | "7d" | "30d";

const PERIOD_LABEL_DAYS: Record<FoodProfitPeriod, number> = { today: 1, "7d": 7, "30d": 30 };

export interface FoodNetProfitResult {
  period: FoodProfitPeriod;
  revenue: number;
  cogs: number;
  fixedCostsProrated: number;
  netProfit: number;
  coverage: { itemsWithSales: number; totalActiveItems: number };
}

export async function getFoodNetProfit(organizationId: string, period: FoodProfitPeriod): Promise<FoodNetProfitResult> {
  const days = PERIOD_LABEL_DAYS[period];
  const from = period === "today" ? startOfDay(new Date()) : daysAgo(days);

  const [salesAgg, variantSales, dishes, fixedCostsMonthly] = await Promise.all([
    prisma.foodSale.aggregate({
      where: { organizationId, occurredAt: { gte: from } },
      _sum: { netAmount: true },
    }),
    prisma.foodDishSale.groupBy({
      by: ["variantId"],
      where: { organizationId, occurredAt: { gte: from } },
      _sum: { quantity: true },
    }),
    getFoodDishesWithCost(organizationId, { activeOnly: true }),
    getTotalMonthlyFixedCosts(organizationId),
  ]);

  const variants = flattenVariants(dishes);
  const variantById = new Map(variants.map((v) => [v.id, v]));
  let cogs = 0;
  const variantsWithSalesIds = new Set<string>();
  for (const row of variantSales) {
    const variant = variantById.get(row.variantId);
    if (!variant) continue;
    cogs += variant.cost * (row._sum.quantity ?? 0);
    variantsWithSalesIds.add(row.variantId);
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
    coverage: { itemsWithSales: variantsWithSalesIds.size, totalActiveItems: variants.length },
  };
}

// ─── FOOD OPS — Reducción de costos ───────────────────────────────────

export interface FoodLowMarginItem {
  variantId: string;
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
  // Suma del costo de este insumo por PORCIÓN a través de todas las
  // variantes activas de tu menú (no el gasto total de compra, que este
  // módulo no registra todavía) -- indica qué insumo pesa más en el costo
  // de tu menú, para saber qué negociar primero con proveedores.
  totalRecipeCost: number;
  usedInDishes: number;
}

export interface FoodCostReductionInsights {
  lowestMarginItems: FoodLowMarginItem[];
  topCostIngredients: FoodTopCostIngredient[];
}

export async function getFoodCostReductionInsights(organizationId: string, limit = 5): Promise<FoodCostReductionInsights> {
  const dishes = await getFoodDishesWithCost(organizationId, { activeOnly: true });
  const variants = flattenVariants(dishes);

  const lowestMarginItems = [...variants]
    .sort((a, b) => (a.marginPct ?? -Infinity) - (b.marginPct ?? -Infinity))
    .slice(0, limit)
    .map((v) => ({ variantId: v.id, dishId: v.dishId, name: v.displayName, marginPct: v.marginPct, cost: v.cost, price: v.price }));

  const ingredientTotals = new Map<string, { name: string; unit: string; totalRecipeCost: number; usedInDishes: Set<string> }>();
  for (const variant of variants) {
    for (const ing of variant.ingredients) {
      const entry = ingredientTotals.get(ing.inventoryItemId) ?? {
        name: ing.name,
        unit: ing.unit,
        totalRecipeCost: 0,
        usedInDishes: new Set<string>(),
      };
      entry.totalRecipeCost += ing.lineCost;
      entry.usedInDishes.add(variant.dishId);
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

  return { lowestMarginItems, topCostIngredients };
}

// ─── FOOD OPS — Recomendaciones para mejorar utilidad ────────────────
// "Alto/bajo volumen" es relativo a la mediana de unidades vendidas del
// propio menú (últimos 30 días), no un número absoluto -- así aplica igual
// a un puesto chico que a una cadena, sin necesitar configuración.

export type FoodProfitRecommendationType = "review_urgent" | "raise_price_or_cut_cost" | "promote";

export interface FoodProfitRecommendation {
  type: FoodProfitRecommendationType;
  variantId: string;
  dishId: string;
  name: string;
  reason: string;
}

const LOW_MARGIN_PCT = 15;
const HIGH_MARGIN_PCT = 40;

export async function getFoodProfitRecommendations(organizationId: string): Promise<FoodProfitRecommendation[]> {
  const dishes = await getFoodDishesWithCost(organizationId, { activeOnly: true });
  const variants = flattenVariants(dishes);
  if (variants.length === 0) return [];

  const since = daysAgo(30);
  const salesRows = await prisma.foodDishSale.groupBy({
    by: ["variantId"],
    where: { organizationId, occurredAt: { gte: since } },
    _sum: { quantity: true },
  });
  const unitsByVariant = new Map(salesRows.map((r) => [r.variantId, r._sum.quantity ?? 0]));

  const recommendations: FoodProfitRecommendation[] = [];

  for (const variant of variants) {
    if (variant.marginAmount < 0) {
      recommendations.push({
        type: "review_urgent",
        variantId: variant.id,
        dishId: variant.dishId,
        name: variant.displayName,
        reason: `Cuesta $${variant.cost.toFixed(2)} pero se vende en $${variant.price.toFixed(2)} — pierdes dinero en cada uno.`,
      });
    }
  }

  const soldVariants = variants.filter((v) => (unitsByVariant.get(v.id) ?? 0) > 0);
  if (soldVariants.length >= 2) {
    const unitsSorted = soldVariants.map((v) => unitsByVariant.get(v.id) ?? 0).sort((a, b) => a - b);
    const median = unitsSorted[Math.floor(unitsSorted.length / 2)];
    for (const variant of soldVariants) {
      const units = unitsByVariant.get(variant.id) ?? 0;
      if (variant.marginAmount >= 0 && variant.marginPct !== null && variant.marginPct < LOW_MARGIN_PCT && units >= median) {
        recommendations.push({
          type: "raise_price_or_cut_cost",
          variantId: variant.id,
          dishId: variant.dishId,
          name: variant.displayName,
          reason: `Se vende bien (${units} en 30 días) pero deja solo ${variant.marginPct}% de margen — considera subir el precio o revisar la receta.`,
        });
      } else if (variant.marginPct !== null && variant.marginPct >= HIGH_MARGIN_PCT && units < median) {
        recommendations.push({
          type: "promote",
          variantId: variant.id,
          dishId: variant.dishId,
          name: variant.displayName,
          reason: `Buen margen (${variant.marginPct}%) pero poca venta (${units} en 30 días) — es buen candidato para promocionar.`,
        });
      }
    }
  }

  return recommendations;
}

// ─── FOOD OPS — Platillos menos vendidos (para promociones) ─────────
// Solo entre variantes con AL MENOS una venta registrada en el rango, para
// no confundir "nunca se ofreció/no se ha capturado" con "se ofreció y
// casi no se vendió", que son situaciones muy distintas.

export interface FoodLeastSoldItem {
  variantId: string;
  dishId: string;
  name: string;
  unitsSold: number;
  price: number;
  marginPct: number | null;
}

export async function getFoodLeastSoldDishes(organizationId: string, days = 30, limit = 5): Promise<FoodLeastSoldItem[]> {
  const dishes = await getFoodDishesWithCost(organizationId, { activeOnly: true });
  const variants = flattenVariants(dishes);
  const since = daysAgo(days);
  const salesRows = await prisma.foodDishSale.groupBy({
    by: ["variantId"],
    where: { organizationId, occurredAt: { gte: since } },
    _sum: { quantity: true },
  });
  const unitsByVariant = new Map(salesRows.map((r) => [r.variantId, r._sum.quantity ?? 0]));

  return variants
    .filter((v) => unitsByVariant.has(v.id))
    .map((v) => ({ variantId: v.id, dishId: v.dishId, name: v.displayName, unitsSold: unitsByVariant.get(v.id) ?? 0, price: v.price, marginPct: v.marginPct }))
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

// ─── FOOD OPS — Ingesta de ventas desde un POS externo (Fase 17) ─────
// Llamado por POST /api/webhooks/pos/orders (autenticación + idempotencia
// las resuelve la ruta vía ingestWebhookEvent, igual que los webhooks de
// n8n) -- esta función solo valida el payload y escribe. A diferencia de
// logFoodDishSales() (captura manual, REEMPLAZA la cantidad del día), aquí
// cada orden SUMA -- un POS manda una orden a la vez, no un total diario.

export interface FoodPosOrderModifier {
  optionId: string;
  quantity: number; // entero != 0; mismo criterio que item.quantity (negativo = cancelación)
}

export interface FoodPosOrderItem {
  variantId: string;
  quantity: number; // entero != 0; negativo = cancelación/ajuste de una orden previa
  modifiers?: FoodPosOrderModifier[]; // opcional -- si se omite, no se registra venta de modificadores para este item
}

export interface FoodPosOrderPayload {
  occurredAt?: string; // ISO 8601; por defecto ahora
  channel?: string; // por defecto "POS"
  grossAmount: number; // puede ser negativo para una cancelación -- ver items.quantity
  netAmount: number; // monto SIN IVA -- nunca "bruto menos descuentos"
  items: FoodPosOrderItem[];
}

export async function processFoodPosOrder(payload: unknown, organizationId: string): Promise<void> {
  if (!(await hasModule(organizationId, "FOOD_OPS"))) {
    throw new Error("El módulo Food no está habilitado para esta organización");
  }

  const body = payload as Partial<FoodPosOrderPayload>;

  if (typeof body.grossAmount !== "number" || typeof body.netAmount !== "number") {
    throw new Error("grossAmount y netAmount son requeridos y deben ser numéricos");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new Error("La orden debe traer al menos un item");
  }
  for (const item of body.items) {
    // quantity puede ser negativa -- una cancelación/ajuste de una orden ya
    // reportada se manda como el mismo variantId con quantity negativa; el
    // upsert de abajo la resta de lo acumulado el mismo día de negocio.
    if (!item?.variantId || typeof item.quantity !== "number" || !Number.isInteger(item.quantity) || item.quantity === 0) {
      throw new Error("Cada item requiere variantId y quantity entero distinto de 0");
    }
    if (item.modifiers !== undefined) {
      if (!Array.isArray(item.modifiers)) throw new Error("modifiers debe ser un arreglo");
      for (const mod of item.modifiers) {
        if (!mod?.optionId || typeof mod.quantity !== "number" || !Number.isInteger(mod.quantity) || mod.quantity === 0) {
          throw new Error("Cada modifier requiere optionId y quantity entero distinto de 0");
        }
      }
    }
  }

  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new Error("occurredAt inválido");
  const businessDay = startOfDay(occurredAt);

  const variantIds = body.items.map((i) => i.variantId);
  const owned = await prisma.foodDishVariant.findMany({
    where: { id: { in: variantIds }, organizationId },
    select: { id: true },
  });
  if (owned.length !== new Set(variantIds).size) {
    throw new Error("Una o más variantes de la orden no pertenecen a esta organización");
  }

  const modifierEntries = body.items.flatMap((item) => item.modifiers ?? []);
  const optionIds = modifierEntries.map((m) => m.optionId);
  let optionNameById = new Map<string, string>();
  if (optionIds.length > 0) {
    const owningOptions = await prisma.foodModifierOption.findMany({
      where: { id: { in: optionIds }, group: { organizationId } },
      select: { id: true, name: true },
    });
    if (owningOptions.length !== new Set(optionIds).size) {
      throw new Error("Uno o más modificadores de la orden no pertenecen a esta organización");
    }
    optionNameById = new Map(owningOptions.map((o) => [o.id, o.name]));
  }

  await prisma.$transaction([
    prisma.foodSale.create({
      data: {
        organizationId,
        occurredAt,
        channel: body.channel ?? "POS",
        grossAmount: body.grossAmount,
        netAmount: body.netAmount,
      },
    }),
    ...body.items.map((item) =>
      prisma.foodDishSale.upsert({
        where: { variantId_occurredAt: { variantId: item.variantId, occurredAt: businessDay } },
        update: { quantity: { increment: item.quantity } },
        create: { organizationId, variantId: item.variantId, occurredAt: businessDay, quantity: item.quantity },
      })
    ),
    ...modifierEntries.map((mod) =>
      prisma.foodModifierOptionSale.upsert({
        where: { optionId_occurredAt: { optionId: mod.optionId, occurredAt: businessDay } },
        update: { quantity: { increment: mod.quantity } },
        create: {
          organizationId,
          optionId: mod.optionId,
          optionName: optionNameById.get(mod.optionId)!,
          occurredAt: businessDay,
          quantity: mod.quantity,
        },
      })
    ),
  ]);
}
