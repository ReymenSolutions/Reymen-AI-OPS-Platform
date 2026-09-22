// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import {
  getFoodDishesWithCost,
  flattenVariants,
  getFoodOperatingCosts,
  getTotalMonthlyFixedCosts,
  getFoodBreakEven,
  getFoodNetProfit,
  getFoodCostReductionInsights,
  getFoodProfitRecommendations,
  getFoodLeastSoldDishes,
  recommendDishPrice,
} from "./food";

async function makeInventoryItem(orgId: string, name: string, unitCost: number, unit = "kg") {
  return prisma.foodInventoryItem.create({
    data: { organizationId: orgId, name, unit, unitCost, currentStock: 100, minStock: 1 },
  });
}

/** Crea un platillo con UNA variante ("Único") -- caso común sin tamaños. */
async function makeDish(
  orgId: string,
  name: string,
  price: number,
  ingredients: { inventoryItemId: string; quantity: number }[]
) {
  const dish = await prisma.foodDish.create({
    data: {
      organizationId: orgId,
      name,
      variants: { create: [{ label: "Único", price, ingredients: { create: ingredients } }] },
    },
    include: { variants: true },
  });
  return { dish, variant: dish.variants[0] };
}

/** Crea un platillo con VARIAS variantes (ej. tamaños), cada una con su propia receta. */
async function makeDishWithVariants(
  orgId: string,
  name: string,
  variants: { label: string; price: number; ingredients: { inventoryItemId: string; quantity: number }[] }[]
) {
  const dish = await prisma.foodDish.create({
    data: {
      organizationId: orgId,
      name,
      variants: { create: variants.map((v) => ({ label: v.label, price: v.price, ingredients: { create: v.ingredients } })) },
    },
    include: { variants: true },
  });
  return dish;
}

function daysAgoDate(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

describe("food.ts — costeo y rentabilidad (platillos con variantes)", () => {
  let org: { id: string } | undefined;

  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
    org = undefined;
  });

  describe("getFoodDishesWithCost / flattenVariants", () => {
    it("computes cost and margin from real ingredient quantities and unit costs", async () => {
      org = await createTestOrg("Food Dish Cost Org");
      const beef = await makeInventoryItem(org.id, "Carne", 100);
      const bun = await makeInventoryItem(org.id, "Pan", 10);
      await makeDish(org.id, "Hamburguesa", 80, [
        { inventoryItemId: beef.id, quantity: 0.2 },
        { inventoryItemId: bun.id, quantity: 1 },
      ]);

      const dishes = await getFoodDishesWithCost(org.id);
      expect(dishes).toHaveLength(1);
      expect(dishes[0].variants).toHaveLength(1);
      const variant = dishes[0].variants[0];
      expect(variant.cost).toBe(30); // 0.2*100 + 1*10
      expect(variant.marginAmount).toBe(50);
      expect(variant.marginPct).toBe(62.5);
      expect(variant.ingredients).toHaveLength(2);
      // Única variante con label por defecto -- el nombre mostrado es solo el del platillo.
      expect(variant.displayName).toBe("Hamburguesa");
    });

    it("gives each size variant its own recipe, cost, and display name", async () => {
      org = await createTestOrg("Food Dish Variants Org");
      const fruit = await makeInventoryItem(org.id, "Fruta", 20);
      await makeDishWithVariants(org.id, "Berry Bloom", [
        { label: "Chico", price: 100, ingredients: [{ inventoryItemId: fruit.id, quantity: 0.2 }] },
        { label: "Grande", price: 160, ingredients: [{ inventoryItemId: fruit.id, quantity: 0.4 }] },
      ]);

      const dishes = await getFoodDishesWithCost(org.id);
      expect(dishes).toHaveLength(1);
      const [chico, grande] = dishes[0].variants; // orderBy label asc -> "Chico" antes que "Grande"
      expect(chico.cost).toBe(4); // 0.2*20
      expect(grande.cost).toBe(8); // 0.4*20
      expect(chico.displayName).toBe("Berry Bloom — Chico");
      expect(grande.displayName).toBe("Berry Bloom — Grande");
    });

    it("returns marginPct null when price is 0", async () => {
      org = await createTestOrg("Food Dish Zero Price Org");
      await prisma.foodDish.create({
        data: { organizationId: org.id, name: "Gratis", variants: { create: [{ label: "Único", price: 0 }] } },
      });
      const dishes = await getFoodDishesWithCost(org.id);
      expect(dishes[0].variants[0].marginPct).toBeNull();
    });

    it("filters inactive dishes when activeOnly is set", async () => {
      org = await createTestOrg("Food Dish ActiveOnly Org");
      await prisma.foodDish.create({ data: { organizationId: org.id, name: "Activo", isActive: true, variants: { create: [{ label: "Único", price: 10 }] } } });
      await prisma.foodDish.create({ data: { organizationId: org.id, name: "Inactivo", isActive: false, variants: { create: [{ label: "Único", price: 10 }] } } });

      expect(await getFoodDishesWithCost(org.id)).toHaveLength(2);
      expect(await getFoodDishesWithCost(org.id, { activeOnly: true })).toHaveLength(1);
    });

    it("flattenVariants collapses dishes into a single list of variants", async () => {
      org = await createTestOrg("Food Flatten Org");
      const ingredient = await makeInventoryItem(org.id, "Insumo", 5);
      await makeDish(org.id, "Solo", 20, [{ inventoryItemId: ingredient.id, quantity: 1 }]);
      await makeDishWithVariants(org.id, "Con tamaños", [
        { label: "Chico", price: 10, ingredients: [{ inventoryItemId: ingredient.id, quantity: 1 }] },
        { label: "Grande", price: 20, ingredients: [{ inventoryItemId: ingredient.id, quantity: 2 }] },
      ]);

      const dishes = await getFoodDishesWithCost(org.id);
      const variants = flattenVariants(dishes);
      expect(variants).toHaveLength(3);
    });
  });

  describe("getFoodOperatingCosts / getTotalMonthlyFixedCosts", () => {
    it("only sums active fixed costs", async () => {
      org = await createTestOrg("Food Fixed Costs Org");
      await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Renta", amountMonthly: 5000, isActive: true } });
      await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Viejo", amountMonthly: 1000, isActive: false } });

      const list = await getFoodOperatingCosts(org.id);
      expect(list).toHaveLength(2);

      const total = await getTotalMonthlyFixedCosts(org.id);
      expect(total).toBe(5000);
    });

    it("returns 0 when there are no fixed costs", async () => {
      org = await createTestOrg("Food No Fixed Costs Org");
      expect(await getTotalMonthlyFixedCosts(org.id)).toBe(0);
    });
  });

  describe("getFoodBreakEven", () => {
    it("computes per-variant break-even units from fixed costs and contribution margin", async () => {
      org = await createTestOrg("Food BreakEven PerVariant Org");
      await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Renta", amountMonthly: 1000, isActive: true } });
      const flour = await makeInventoryItem(org.id, "Harina", 10);
      await makeDish(org.id, "Pizza", 60, [{ inventoryItemId: flour.id, quantity: 1 }]); // cost 10, margin 50

      const result = await getFoodBreakEven(org.id);
      expect(result.fixedCostsMonthly).toBe(1000);
      expect(result.perVariant).toHaveLength(1);
      expect(result.perVariant[0].breakEvenUnits).toBe(20); // 1000 / 50
      expect(result.blended).toBeNull(); // sin ventas registradas
    });

    it("returns null breakEvenUnits for a variant with non-positive margin", async () => {
      org = await createTestOrg("Food BreakEven Negative Margin Org");
      const expensive = await makeInventoryItem(org.id, "Caro", 100);
      await makeDish(org.id, "Sale a pérdida", 50, [{ inventoryItemId: expensive.id, quantity: 1 }]); // cost 100 > price 50

      const result = await getFoodBreakEven(org.id);
      expect(result.perVariant[0].breakEvenUnits).toBeNull();
    });

    it("computes a blended break-even from real sales mix across variants in the last 30 days", async () => {
      org = await createTestOrg("Food BreakEven Blended Org");
      await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Renta", amountMonthly: 900, isActive: true } });
      const cheapIngredient = await makeInventoryItem(org.id, "Insumo", 5);
      const { variant: variantA } = await makeDish(org.id, "A", 25, [{ inventoryItemId: cheapIngredient.id, quantity: 1 }]); // margin 20
      const { variant: variantB } = await makeDish(org.id, "B", 15, [{ inventoryItemId: cheapIngredient.id, quantity: 1 }]); // margin 10

      await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId: variantA.id, occurredAt: daysAgoDate(1), quantity: 10 } });
      await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId: variantB.id, occurredAt: daysAgoDate(2), quantity: 10 } });

      const result = await getFoodBreakEven(org.id);
      expect(result.blended).not.toBeNull();
      expect(result.blended!.weightedAvgContributionMargin).toBe(15); // (20*10 + 10*10) / 20
      expect(result.blended!.breakEvenUnits).toBe(60); // ceil(900 / 15)
    });

    it("ignores sales older than 30 days when computing the blended view", async () => {
      org = await createTestOrg("Food BreakEven Stale Sales Org");
      const ingredient = await makeInventoryItem(org.id, "Insumo", 5);
      const { variant } = await makeDish(org.id, "Viejo", 25, [{ inventoryItemId: ingredient.id, quantity: 1 }]);

      await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId: variant.id, occurredAt: daysAgoDate(45), quantity: 10 } });

      const result = await getFoodBreakEven(org.id);
      expect(result.blended).toBeNull();
    });

    it("weighs each size variant of the same dish by its own margin and sales, not a shared one", async () => {
      org = await createTestOrg("Food BreakEven Sized Variants Org");
      await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Renta", amountMonthly: 100, isActive: true } });
      const fruit = await makeInventoryItem(org.id, "Fruta", 10);
      const dish = await makeDishWithVariants(org.id, "Smoothie", [
        { label: "Chico", price: 30, ingredients: [{ inventoryItemId: fruit.id, quantity: 1 }] }, // cost 10, margin 20
        { label: "Grande", price: 50, ingredients: [{ inventoryItemId: fruit.id, quantity: 2 }] }, // cost 20, margin 30
      ]);
      const [chico, grande] = dish.variants.sort((a, b) => a.label.localeCompare(b.label));

      const result = await getFoodBreakEven(org.id);
      const chicoRow = result.perVariant.find((r) => r.variantId === chico.id)!;
      const grandeRow = result.perVariant.find((r) => r.variantId === grande.id)!;
      expect(chicoRow.breakEvenUnits).toBe(5); // ceil(100/20)
      expect(grandeRow.breakEvenUnits).toBe(4); // ceil(100/30) -> 3.33 -> 4
    });
  });

  describe("getFoodNetProfit", () => {
    it("computes revenue - cogs - prorated fixed costs, with coverage for the period", async () => {
      org = await createTestOrg("Food Net Profit Org");
      await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Renta", amountMonthly: 300, isActive: true } });
      const ingredient = await makeInventoryItem(org.id, "Insumo", 5);
      const { variant: soldVariant } = await makeDish(org.id, "Vendido", 20, [{ inventoryItemId: ingredient.id, quantity: 1 }]); // cost 5
      await makeDish(org.id, "SinVenta", 30, [{ inventoryItemId: ingredient.id, quantity: 1 }]);

      await prisma.foodSale.create({ data: { organizationId: org.id, occurredAt: new Date(), grossAmount: 100, netAmount: 100 } });
      await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId: soldVariant.id, occurredAt: startOfTodayDate(), quantity: 4 } });

      const result = await getFoodNetProfit(org.id, "today");
      expect(result.revenue).toBe(100);
      expect(result.cogs).toBe(20); // 4 * 5
      expect(result.fixedCostsProrated).toBe(10); // 300/30 * 1
      expect(result.netProfit).toBe(70); // 100 - 20 - 10
      expect(result.coverage).toEqual({ itemsWithSales: 1, totalActiveItems: 2 });
    });

    it("prorates fixed costs correctly across the 7d and 30d periods", async () => {
      org = await createTestOrg("Food Net Profit Periods Org");
      await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Renta", amountMonthly: 300, isActive: true } });

      const result7d = await getFoodNetProfit(org.id, "7d");
      expect(result7d.fixedCostsProrated).toBe(70); // 300/30 * 7

      const result30d = await getFoodNetProfit(org.id, "30d");
      expect(result30d.fixedCostsProrated).toBe(300); // 300/30 * 30
    });

    it("reports zero revenue and full coverage gap when nothing has been logged", async () => {
      org = await createTestOrg("Food Net Profit Empty Org");
      const ingredient = await makeInventoryItem(org.id, "Insumo", 5);
      await makeDish(org.id, "SinVenta", 20, [{ inventoryItemId: ingredient.id, quantity: 1 }]);

      const result = await getFoodNetProfit(org.id, "today");
      expect(result.revenue).toBe(0);
      expect(result.cogs).toBe(0);
      expect(result.coverage).toEqual({ itemsWithSales: 0, totalActiveItems: 1 });
    });

    it("counts each size variant with sales toward coverage independently", async () => {
      org = await createTestOrg("Food Net Profit Coverage Variants Org");
      const ingredient = await makeInventoryItem(org.id, "Insumo", 2);
      const dish = await makeDishWithVariants(org.id, "Jugo", [
        { label: "Chico", price: 20, ingredients: [{ inventoryItemId: ingredient.id, quantity: 1 }] },
        { label: "Grande", price: 30, ingredients: [{ inventoryItemId: ingredient.id, quantity: 2 }] },
      ]);
      const chico = dish.variants.find((v) => v.label === "Chico")!;

      await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId: chico.id, occurredAt: startOfTodayDate(), quantity: 3 } });

      const result = await getFoodNetProfit(org.id, "today");
      expect(result.coverage).toEqual({ itemsWithSales: 1, totalActiveItems: 2 });
    });
  });

  describe("getFoodCostReductionInsights", () => {
    it("ranks variants by lowest margin and ingredients by total recipe cost", async () => {
      org = await createTestOrg("Food Cost Insights Org");
      const expensiveIngredient = await makeInventoryItem(org.id, "Caro", 50);
      const cheapIngredient = await makeInventoryItem(org.id, "Barato", 2);
      await makeDish(org.id, "Bajo margen", 55, [{ inventoryItemId: expensiveIngredient.id, quantity: 1 }]); // cost 50, margin ~9%
      await makeDish(org.id, "Alto margen", 20, [{ inventoryItemId: cheapIngredient.id, quantity: 1 }]); // cost 2, margin 90%

      const insights = await getFoodCostReductionInsights(org.id);
      expect(insights.lowestMarginItems[0].name).toBe("Bajo margen");
      expect(insights.topCostIngredients[0].name).toBe("Caro");
      expect(insights.topCostIngredients[0].usedInDishes).toBe(1);
    });

    it("counts an ingredient shared across a dish's size variants once per dish, not once per variant", async () => {
      org = await createTestOrg("Food Cost Insights Shared Ingredient Org");
      const fruit = await makeInventoryItem(org.id, "Fruta", 10);
      await makeDishWithVariants(org.id, "Smoothie", [
        { label: "Chico", price: 30, ingredients: [{ inventoryItemId: fruit.id, quantity: 1 }] },
        { label: "Grande", price: 50, ingredients: [{ inventoryItemId: fruit.id, quantity: 2 }] },
      ]);

      const insights = await getFoodCostReductionInsights(org.id);
      const fruitInsight = insights.topCostIngredients.find((i) => i.name === "Fruta")!;
      expect(fruitInsight.usedInDishes).toBe(1); // un solo platillo, aunque en 2 variantes
      expect(fruitInsight.totalRecipeCost).toBe(30); // 1*10 (chico) + 2*10 (grande)
    });
  });

  describe("getFoodProfitRecommendations", () => {
    it("flags a variant sold below cost as review_urgent regardless of sales volume", async () => {
      org = await createTestOrg("Food Reco Urgent Org");
      const expensiveIngredient = await makeInventoryItem(org.id, "Caro", 100);
      await makeDish(org.id, "Pierde dinero", 50, [{ inventoryItemId: expensiveIngredient.id, quantity: 1 }]);

      const recos = await getFoodProfitRecommendations(org.id);
      expect(recos).toHaveLength(1);
      expect(recos[0].type).toBe("review_urgent");
    });

    it("recommends raising price for high-volume low-margin items and promoting low-volume high-margin ones", async () => {
      org = await createTestOrg("Food Reco Volume Org");
      const ingredient = await makeInventoryItem(org.id, "Insumo", 10);
      // margen bajo (10%), alto volumen
      const { variant: lowMarginHighVolume } = await makeDish(org.id, "Popular barato", 11.11, [{ inventoryItemId: ingredient.id, quantity: 1 }]);
      // margen alto (80%), bajo volumen
      const { variant: highMarginLowVolume } = await makeDish(org.id, "Caro poco vendido", 50, [{ inventoryItemId: ingredient.id, quantity: 1 }]);

      await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId: lowMarginHighVolume.id, occurredAt: daysAgoDate(1), quantity: 50 } });
      await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId: highMarginLowVolume.id, occurredAt: daysAgoDate(1), quantity: 2 } });

      const recos = await getFoodProfitRecommendations(org.id);
      const types = recos.map((r) => r.type);
      expect(types).toContain("raise_price_or_cut_cost");
      expect(types).toContain("promote");
    });

    it("returns no recommendations when there are no active dishes", async () => {
      org = await createTestOrg("Food Reco Empty Org");
      expect(await getFoodProfitRecommendations(org.id)).toEqual([]);
    });

    it("evaluates each size variant independently — a bad Grande doesn't flag a healthy Chico", async () => {
      org = await createTestOrg("Food Reco Per Variant Org");
      const fruit = await makeInventoryItem(org.id, "Fruta", 10);
      const expensive = await makeInventoryItem(org.id, "Caro", 200);
      await makeDishWithVariants(org.id, "Smoothie", [
        { label: "Chico", price: 30, ingredients: [{ inventoryItemId: fruit.id, quantity: 1 }] }, // cost 10, margin healthy
        { label: "Grande", price: 30, ingredients: [{ inventoryItemId: expensive.id, quantity: 1 }] }, // cost 200, loses money
      ]);

      const recos = await getFoodProfitRecommendations(org.id);
      expect(recos).toHaveLength(1);
      expect(recos[0].name).toBe("Smoothie — Grande");
    });
  });

  describe("getFoodLeastSoldDishes", () => {
    it("ranks ascending by units sold, excluding variants with no logged sales", async () => {
      org = await createTestOrg("Food Least Sold Org");
      const ingredient = await makeInventoryItem(org.id, "Insumo", 5);
      const { variant: popular } = await makeDish(org.id, "Popular", 20, [{ inventoryItemId: ingredient.id, quantity: 1 }]);
      const { variant: unpopular } = await makeDish(org.id, "Poco vendido", 20, [{ inventoryItemId: ingredient.id, quantity: 1 }]);
      await makeDish(org.id, "Nunca registrado", 20, [{ inventoryItemId: ingredient.id, quantity: 1 }]);

      await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId: popular.id, occurredAt: daysAgoDate(1), quantity: 30 } });
      await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId: unpopular.id, occurredAt: daysAgoDate(1), quantity: 3 } });

      const result = await getFoodLeastSoldDishes(org.id);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Poco vendido");
      expect(result[1].name).toBe("Popular");
    });
  });

  describe("recommendDishPrice", () => {
    it("divides cost by the target cost percentage", () => {
      expect(recommendDishPrice(30, 30)).toBe(100);
      expect(recommendDishPrice(21, 35)).toBe(60);
    });

    it("falls back to cost for an out-of-range target percentage", () => {
      expect(recommendDishPrice(30, 0)).toBe(30);
      expect(recommendDishPrice(30, 100)).toBe(30);
    });
  });
});

function startOfTodayDate(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
