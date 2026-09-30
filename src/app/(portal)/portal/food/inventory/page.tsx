import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { createFoodInventoryItem } from "@/actions/food";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { FoodInventoryItemEditDialog } from "@/components/portal/FoodInventoryItemEditDialog";
import { FoodStockAdjustDialog } from "@/components/portal/FoodStockAdjustDialog";
import type { FoodInventoryMovementType } from "@prisma/client";

export default async function FoodInventoryPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;

  const [t, lang, items, movements] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.foodInventoryItem.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
    }),
    prisma.foodInventoryMovement.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { inventoryItem: { select: { name: true, unit: true } } },
    }),
  ]);

  const f = pickDict(foodStrings, lang);
  const qty = (n: number) => n.toLocaleString(f.dateLocale, { maximumFractionDigits: 3 });
  const movementLabel: Record<FoodInventoryMovementType, string> = {
    SALE: f.movSale,
    SALE_CANCELLATION: f.movSaleCancellation,
    MANUAL_DISH_SALES: f.movManualDishSales,
    PURCHASE: f.movPurchase,
    PURCHASE_VOID: f.movPurchaseVoid,
    ADJUSTMENT: f.movAdjustment,
  };
  const hasNegative = items.some((i) => Number(i.currentStock) < 0);
  const lowStock = items.filter((i) => Number(i.currentStock) <= Number(i.minStock));

  return (
    <div>
      <PageHeader
        title={t.foodInventory}
        description={
          lowStock.length > 0
            ? f.inventoryLowDesc(lowStock.length)
            : f.inventoryDesc
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{f.supplies}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Package} title={f.noSuppliesYet} description={f.addFirstWithForm} />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const stock = Number(item.currentStock);
                    const low = stock <= Number(item.minStock);
                    return (
                      <li key={item.id} className="flex items-center justify-between gap-3 px-6 py-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900">{item.name}</p>
                            <Badge variant="secondary" className="text-[10px]">
                              {item.category === "NON_EDIBLE" ? f.nonEdible : f.edible}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500">
                            {f.minimumLabel(Number(item.minStock), item.unit)}
                            {item.unitCost !== null && f.unitCostLabel(`$${Number(item.unitCost).toFixed(2)}`)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={stock < 0 ? "text-sm font-semibold text-red-600" : "text-sm font-semibold text-slate-900"}>
                              {qty(stock)} {item.unit}
                            </p>
                            {low && <Badge variant="destructive" className="mt-1">{f.lowStockBadge}</Badge>}
                          </div>
                          <div className="flex items-center">
                            <FoodStockAdjustDialog itemId={item.id} name={item.name} unit={item.unit} currentStock={stock} />
                            <FoodInventoryItemEditDialog
                              item={{
                                id: item.id,
                                name: item.name,
                                unit: item.unit,
                                category: item.category,
                                minStock: Number(item.minStock),
                                unitCost: item.unitCost === null ? null : Number(item.unitCost),
                              }}
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          {hasNegative && <p className="mt-2 text-xs text-red-600">{f.negativeStockHint}</p>}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">{f.recentMovements}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {movements.length === 0 ? (
                <p className="px-6 py-4 text-sm text-slate-500">{f.noMovementsYet}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {movements.map((m) => {
                    const q = Number(m.quantity);
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-6 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-900">
                            <span className="font-medium">{m.inventoryItem.name}</span>
                            <span className="text-slate-500"> · {movementLabel[m.type]}</span>
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {m.createdAt.toLocaleString(f.dateLocale, { dateStyle: "short", timeStyle: "short" })}
                            {m.note ? ` · ${m.note}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={q < 0 ? "text-sm font-semibold text-red-600" : "text-sm font-semibold text-emerald-600"}>
                            {q > 0 ? "+" : ""}{qty(q)} {m.inventoryItem.unit}
                          </p>
                          <p className="text-[11px] text-slate-400">{f.stockAfterLabel(qty(Number(m.stockAfter)), m.inventoryItem.unit)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-base">{f.addSupply}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createFoodInventoryItem} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="name" className="text-xs font-medium text-slate-600">{f.name}</label>
                <input id="name" name="name" type="text" required className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="unit" className="text-xs font-medium text-slate-600">{f.unit}</label>
                <input id="unit" name="unit" type="text" placeholder={f.unitPlaceholder} required className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="category" className="text-xs font-medium text-slate-600">{f.category}</label>
                <select id="category" name="category" defaultValue="EDIBLE" className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
                  <option value="EDIBLE">{f.edible}</option>
                  <option value="NON_EDIBLE">{f.nonEdible}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor="currentStock" className="text-xs font-medium text-slate-600">{f.currentStock}</label>
                  <input id="currentStock" name="currentStock" type="number" step="0.001" min="0" defaultValue={0} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label htmlFor="minStock" className="text-xs font-medium text-slate-600">{f.minimum}</label>
                  <input id="minStock" name="minStock" type="number" step="0.001" min="0" defaultValue={0} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="unitCost" className="text-xs font-medium text-slate-600">{f.unitCostOptional}</label>
                <input id="unitCost" name="unitCost" type="number" step="0.01" min="0" className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <p className="text-xs text-slate-400">{f.initialStockHint}</p>
              <button type="submit" className="mt-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
                {f.saveSupply}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
