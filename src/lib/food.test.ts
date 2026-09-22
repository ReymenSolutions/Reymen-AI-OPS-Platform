// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import {
  getFoodDishesWithCost,
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

async function makeDish(
  orgId: string,
  name: string,
  price: number,
  ingredients: { inventoryItemId: string; quantity: number }[]
) {
  return prisma.foodDish.create({
    data: {
      organizationId: orgId,
      name,
      price,
      ingredients: { create: ingredients },
    },
  });
}

function daysAgoDate(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

describe("food.ts — costeo y rentabilidad", () => {
  let org: { id: string } | undefined;

  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
    org = undefined;
  });

  describe("getFoodDishesWithCost", () => {
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
      const dish = dishes[0];
      expect(dish.cost).toBe(30); // 0.2*100 + 1*10
      expect(dish.marginAmount).toBe(50);
      expect(dish.marginPct).toBe(62.5);
      expect(dish.ingredients).toHaveLength(2);
    });

    it("returns marginPct null when price is 0", async () => {
      org = await createTestOrg("Food Dish Zero Price Org");
      await prisma.foodDish.create({ data: { organizationId: org.id, name: "Gratis", price: 0 } });
      const dishes = await getFoodDishesWithCost(org.id);
      expect(dishes[0].marginPct).toBeNull();
    });

    it("filters inactive dishes when activeOnly is set", async () => {
      org = await createTestOrg("Food Dish ActiveOnly Org");
      await prisma.foodDish.create({ data: { organizationId: org.id, name: "Activo", price: 10, isActive: true } });
      await prisma.foodDish.create({ data: { organizationId: org.id, name: "Inactivo", price: 10, isActive: false } });

      expect(await getFoodDishesWithCost(org.id)).toHaveLength(2);
      expect(await getFoodDishesWithCost(org.id, { activeOnly: true })).toHaveLength(1);
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
    it("computes per-dish break-even units from fixed costs and contribution margin", async () => {
      org = await createTestOrg("Food BreakEven PerDish Org");
      await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Renta", amountMonthly: 1000, isActive: true } });
      const flour = await makeInventoryItem(org.id, "Harina", 10);
      await makeDish(org.id, "Pizza", 60, [{ inventoryItemId: flour.id, quantity: 1 }]); // cost 10, margin 50

      const result = await getFoodBreakEven(org.id);
      expect(result.fixedCostsMonthly).toBe(1000);
      expect(result.perDish).toHaveLength(1);
      expect(result.perDish[0].breakEvenUnits).toBe(20); // 1000 / 50
      expect(result.blended).toBeNull(); // sin ventas registradas
    });

    it("returns null breakEvenUnits for a dish with non-positive margin", async () => {
      org = await createTestOrg("Food BreakEven Negative Margin Org");
      const expensive = await makeInventoryItem(org.id, "Caro", 100);
      await makeDish(org.id, "Sale a pérdida", 50, [{ inventoryItemId: expensive.id, quantity: 1 }]); // cost 100 > price 50

      const result = await getFoodBreakEven(org.id);
      expect(result.perDish[0].breakEvenUnits).toBeNull();
    });

    it("computes a blended break-even from real dish-sale mix in the last 30 days", async () => {
      org = await createTestOrg("Food BreakEven Blended Org");
      await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Renta", amountMonthly: 900, isActive: true } });
      const cheapIngredient = await makeInventoryItem(org.id, "Insumo", 5);
      const dishA = await makeDish(org.id, "A", 25, [{ inventoryItemId: cheapIngredient.id, quantity: 1 }]); // margin 20
      const dishB = await makeDish(org.id, "B", 15, [{ inventoryItemId: cheapIngredient.id, quantity: 1 }]); // margin 10

      await prisma.foodDishSale.create({ data: { organizationId: org.id, dishId: dishA.id, occurredAt: daysAgoDate(1), quantity: 10 } });
      await prisma.foodDishSale.create({ data: { organizationId: org.id, dishId: dishB.id, occurredAt: daysAgoDate(2), quantity: 10 } });

      const result = await getFoodBreakEven(org.id);
      expect(result.blended).not.toBeNull();
      expect(result.blended!.weightedAvgContributionMargin).toBe(15); // (20*10 + 10*10) / 20
      expect(result.blended!.breakEvenUnits).toBe(60); // ceil(900 / 15)
    });

    it("ignores dish sales older than 30 days when computing the blended view", async () => {
      org = await createTestOrg("Food BreakEven Stale Sales Org");
      const ingredient = await makeInventoryItem(org.id, "Insumo", 5);
      const dish = await makeDish(org.id, "Viejo", 25, [{ inventoryItemId: ingredient.id, quantity: 1 }]);

      await prisma.foodDishSale.create({ data: { organizationId: org.id, dishId: dish.id, occurredAt: daysAgoDate(45), quantity: 10 } });

      const result = await getFoodBreakEven(org.id);
      expect(result.blended).toBeNull();
    });
  });

  describe("getFoodNetProfit", () => {
    it("computes revenue - cogs - prorated fixed costs, with coverage for the period", async () => {
      org = await createTestOrg("Food Net Profit Org");
      await prisma.foodOperatingCost.create({ data: { organizationId: org.id, name: "Renta", amountMonthly: 300, isActive: true } });
      const ingredient = await makeInventoryItem(org.id, "Insumo", 5);
      const dishSold = await makeDish(org.id, "Vendido", 20, [{ inventoryItemId: ingredient.id, quantity: 1 }]); // cost 5
      await makeDish(org.id, "SinVenta", 30, [{ inventoryItemId: ingredient.id, quantity: 1 }]);

      await prisma.foodSale.create({ data: { organizationId: org.id, occurredAt: new Date(), grossAmount: 100, netAmount: 100 } });
      await prisma.foodDishSale.create({ data: { organizationId: org.id, dishId: dishSold.id, occurredAt: startOfTodayDate(), quantity: 4 } });

      const result = await getFoodNetProfit(org.id, "today");
      expect(result.revenue).toBe(100);
      expect(result.cogs).toBe(20); // 4 * 5
      expect(result.fixedCostsProrated).toBe(10); // 300/30 * 1
      expect(result.netProfit).toBe(70); // 100 - 20 - 10
      expect(result.coverage).toEqual({ dishesWithSales: 1, totalActiveDishes: 2 });
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
      expect(result.coverage).toEqual({ dishesWithSales: 0, totalActiveDishes: 1 });
    });
  });

  describe("getFoodCostReductionInsights", () => {
    it("ranks dishes by lowest margin and ingredients by total recipe cost", async () => {
      org = await createTestOrg("Food Cost Insights Org");
      const expensiveIngredient = await makeInventoryItem(org.id, "Caro", 50);
      const cheapIngredient = await makeInventoryItem(org.id, "Barato", 2);
      await makeDish(org.id, "Bajo margen", 55, [{ inventoryItemId: expensiveIngredient.id, quantity: 1 }]); // cost 50, margin ~9%
      await makeDish(org.id, "Alto margen", 20, [{ inventoryItemId: cheapIngredient.id, quantity: 1 }]); // cost 2, margin 90%

      const insights = await getFoodCostReductionInsights(org.id);
      expect(insights.lowestMarginDishes[0].name).toBe("Bajo margen");
      expect(insights.topCostIngredients[0].name).toBe("Caro");
      expect(insights.topCostIngredients[0].usedInDishes).toBe(1);
    });
  });

  describe("getFoodProfitRecommendations", () => {
    it("flags a dish sold below cost as review_urgent regardless of sales volume", async () => {
      org = await createTestOrg("Food Reco Urgent Org");
      const expensiveIngredient = await makeInventoryItem(org.id, "Caro", 100);
      await makeDish(org.id, "Pierde dinero", 50, [{ inventoryItemId: expensiveIngredient.id, quantity: 1 }]);

      const recos = await getFoodProfitRecommendations(org.id);
      expect(recos).toHaveLength(1);
      expect(recos[0].type).toBe("review_urgent");
    });

    it("recommends raising price for high-volume low-margin dishes and promoting low-volume high-margin ones", async () => {
      org = await createTestOrg("Food Reco Volume Org");
      const ingredient = await makeInventoryItem(org.id, "Insumo", 10);
      // margen bajo (10%), alto volumen
      const lowMarginHighVolume = await makeDish(org.id, "Popular barato", 11.11, [{ inventoryItemId: ingredient.id, quantity: 1 }]);
      // margen alto (80%), bajo volumen
      const highMarginLowVolume = await makeDish(org.id, "Caro poco vendido", 50, [{ inventoryItemId: ingredient.id, quantity: 1 }]);

      await prisma.foodDishSale.create({ data: { organizationId: org.id, dishId: lowMarginHighVolume.id, occurredAt: daysAgoDate(1), quantity: 50 } });
      await prisma.foodDishSale.create({ data: { organizationId: org.id, dishId: highMarginLowVolume.id, occurredAt: daysAgoDate(1), quantity: 2 } });

      const recos = await getFoodProfitRecommendations(org.id);
      const types = recos.map((r) => r.type);
      expect(types).toContain("raise_price_or_cut_cost");
      expect(types).toContain("promote");
    });

    it("returns no recommendations when there are no active dishes", async () => {
      org = await createTestOrg("Food Reco Empty Org");
      expect(await getFoodProfitRecommendations(org.id)).toEqual([]);
    });
  });

  describe("getFoodLeastSoldDishes", () => {
    it("ranks ascending by units sold, excluding dishes with no logged sales", async () => {
      org = await createTestOrg("Food Least Sold Org");
      const ingredient = await makeInventoryItem(org.id, "Insumo", 5);
      const popular = await makeDish(org.id, "Popular", 20, [{ inventoryItemId: ingredient.id, quantity: 1 }]);
      const unpopular = await makeDish(org.id, "Poco vendido", 20, [{ inventoryItemId: ingredient.id, quantity: 1 }]);
      await makeDish(org.id, "Nunca registrado", 20, [{ inventoryItemId: ingredient.id, quantity: 1 }]);

      await prisma.foodDishSale.create({ data: { organizationId: org.id, dishId: popular.id, occurredAt: daysAgoDate(1), quantity: 30 } });
      await prisma.foodDishSale.create({ data: { organizationId: org.id, dishId: unpopular.id, occurredAt: daysAgoDate(1), quantity: 3 } });

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
