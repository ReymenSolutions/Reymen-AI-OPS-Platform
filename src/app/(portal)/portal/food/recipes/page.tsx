import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getFoodDishesWithCost, flattenVariants } from "@/lib/food";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { FoodDishFormDialog } from "@/components/portal/FoodDishFormDialog";
import { FoodDishActiveToggle } from "@/components/portal/FoodDishActiveToggle";
import { FoodDailyDishSalesForm } from "@/components/portal/FoodDailyDishSalesForm";
import { cn } from "@/lib/utils";
import { ChefHat } from "lucide-react";

function marginColor(marginPct: number | null): string {
  if (marginPct === null) return "text-slate-400";
  if (marginPct < 15) return "text-red-600";
  if (marginPct < 30) return "text-amber-600";
  return "text-emerald-600";
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function FoodRecipesPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;

  const [t, dishes, inventoryItemsRaw, todaySales] = await Promise.all([
    getServerT(),
    getFoodDishesWithCost(orgId),
    prisma.foodInventoryItem.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, unit: true, unitCost: true },
      orderBy: { name: "asc" },
    }),
    prisma.foodDishSale.findMany({
      where: { organizationId: orgId, occurredAt: startOfToday() },
      select: { variantId: true, quantity: true },
    }),
  ]);

  const inventoryItems = inventoryItemsRaw.map((i) => ({ ...i, unitCost: i.unitCost !== null ? Number(i.unitCost) : null }));
  const todayQtyByVariant = new Map(todaySales.map((s) => [s.variantId, s.quantity]));
  const activeVariants = flattenVariants(dishes.filter((d) => d.isActive));

  return (
    <div>
      <PageHeader
        title={t.foodRecipes}
        description="Ingredientes, cantidades y costo por receta."
        actions={<FoodDishFormDialog inventoryItems={inventoryItems} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Platillos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {dishes.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={ChefHat} title="Sin platillos todavía" description="Crea el primero con el botón de arriba." />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {dishes.map((dish) => (
                    <li key={dish.id} className={cn("px-6 py-3", !dish.isActive && "opacity-50")}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <p className="truncate text-sm font-medium text-slate-900">{dish.name}</p>
                          {!dish.isActive && <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1">
                          <FoodDishFormDialog
                            inventoryItems={inventoryItems}
                            dish={{
                              id: dish.id,
                              name: dish.name,
                              variants: dish.variants.map((v) => ({
                                id: v.id,
                                label: v.label,
                                price: v.price,
                                ingredients: v.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity })),
                              })),
                            }}
                          />
                          <FoodDishActiveToggle dishId={dish.id} isActive={dish.isActive} />
                        </div>
                      </div>
                      <ul className="mt-1.5 space-y-0.5 pl-0.5">
                        {dish.variants.map((v) => (
                          <li key={v.id} className="text-xs text-slate-500">
                            {dish.variants.length > 1 && <span className="font-medium text-slate-600">{v.label}: </span>}
                            Costo: ${v.cost.toFixed(2)} · Precio: ${v.price.toFixed(2)}
                            {v.marginPct !== null && (
                              <span className={cn("ml-1 font-medium", marginColor(v.marginPct))}> · Margen: {v.marginPct}%</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <FoodDailyDishSalesForm
          variants={activeVariants.map((v) => ({ variantId: v.id, displayName: v.displayName, todayQuantity: todayQtyByVariant.get(v.id) ?? 0 }))}
        />
      </div>
    </div>
  );
}
