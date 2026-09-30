import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasModule, requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getFoodDishesWithCost, flattenVariants, getFoodDishCategories, getFoodModifierGroups } from "@/lib/food";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { FoodDishFormDialog } from "@/components/portal/FoodDishFormDialog";
import { FoodDishActiveToggle } from "@/components/portal/FoodDishActiveToggle";
import { FoodDailyDishSalesForm } from "@/components/portal/FoodDailyDishSalesForm";
import { FoodDishCategoryFormDialog } from "@/components/portal/FoodDishCategoryFormDialog";
import { FoodDishCategoryDeleteButton } from "@/components/portal/FoodDishCategoryDeleteButton";
import { FoodModifierGroupFormDialog } from "@/components/portal/FoodModifierGroupFormDialog";
import { FoodModifierGroupDeleteButton } from "@/components/portal/FoodModifierGroupDeleteButton";
import { cn } from "@/lib/utils";
import { ChefHat, Tag, SlidersHorizontal } from "lucide-react";
import { PosLockedNotice } from "@/components/portal/PosLockedNotice";
import { FoodRecipeRecalcForm } from "@/components/portal/FoodRecipeRecalcForm";
import { can } from "@/lib/permissions";

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

  const [t, lang, dishes, inventoryItemsRaw, todaySales, categories, modifierGroups, usesPos] = await Promise.all([
    getServerT(),
    getServerLang(),
    getFoodDishesWithCost(orgId),
    prisma.foodInventoryItem.findMany({
      // Los desactivados solo siguen disponibles si ya están en alguna receta.
      where: { organizationId: orgId, OR: [{ isActive: true }, { dishLinks: { some: {} } }] },
      select: { id: true, name: true, unit: true, unitCost: true },
      orderBy: { name: "asc" },
    }),
    prisma.foodDishSale.findMany({
      where: { organizationId: orgId, occurredAt: startOfToday() },
      select: { variantId: true, quantity: true },
    }),
    getFoodDishCategories(orgId),
    getFoodModifierGroups(orgId),
    hasModule(orgId, "REYMEN_POS"),
  ]);

  const f = pickDict(foodStrings, lang);
  const canManage = can(session.user.role, "food:manage");
  const inventoryItems = inventoryItemsRaw.map((i) => ({ ...i, unitCost: i.unitCost !== null ? Number(i.unitCost) : null }));
  const todayQtyByVariant = new Map(todaySales.map((s) => [s.variantId, s.quantity]));
  const activeVariants = flattenVariants(dishes.filter((d) => d.isActive));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const modifierGroupOptions = modifierGroups.map((g) => ({ id: g.id, name: g.name }));
  const modifierGroupById = new Map(modifierGroups.map((g) => [g.id, g]));

  return (
    <div>
      <PageHeader
        title={t.foodRecipes}
        description={f.recipesDesc}
        actions={
          canManage ? <FoodDishFormDialog inventoryItems={inventoryItems} categories={categoryOptions} modifierGroups={modifierGroupOptions} /> : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{f.dishes}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {dishes.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={ChefHat} title={f.noDishesYet} description={f.createFirstWithButton} />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {dishes.map((dish) => (
                    <li key={dish.id} className={cn("px-6 py-3", !dish.isActive && "opacity-50")}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <p className="truncate text-sm font-medium text-slate-900">{dish.name}</p>
                          {dish.categoryName && (
                            <Badge variant="outline" className="text-[10px]">{dish.categoryName}</Badge>
                          )}
                          {!dish.isActive && <Badge variant="secondary" className="text-[10px]">{f.inactive}</Badge>}
                        </div>
                        {canManage && (
                          <div className="flex flex-shrink-0 items-center gap-1">
                            <FoodDishFormDialog
                              inventoryItems={inventoryItems}
                              categories={categoryOptions}
                              modifierGroups={modifierGroupOptions}
                              dish={{
                                id: dish.id,
                                name: dish.name,
                                categoryId: dish.categoryId,
                                modifierGroupIds: dish.modifierGroupIds,
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
                        )}
                      </div>
                      <ul className="mt-1.5 space-y-0.5 pl-0.5">
                        {dish.variants.map((v) => (
                          <li key={v.id} className="text-xs text-slate-500">
                            {dish.variants.length > 1 && <span className="font-medium text-slate-600">{v.label}: </span>}
                            {f.costPriceLine(`$${v.cost.toFixed(2)}`, `$${v.price.toFixed(2)}`)}
                            {v.marginPct !== null && (
                              <span className={cn("ml-1 font-medium", marginColor(v.marginPct))}>{f.marginLine(v.marginPct)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {dish.modifierGroupIds.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1 pl-0.5">
                          {dish.modifierGroupIds.map((gid) => {
                            const g = modifierGroupById.get(gid);
                            if (!g) return null;
                            return (
                              <span key={gid} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                {g.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{f.categories}</CardTitle>
              {canManage && <FoodDishCategoryFormDialog />}
            </CardHeader>
            <CardContent className="p-0">
              {categories.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Tag} title={f.noCategoriesYet} description={f.noCategoriesDesc} />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {categories.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-6 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">{c.name}</p>
                        <span className="text-xs text-slate-400">
                          {f.dishCount(c.dishCount)}
                        </span>
                      </div>
                      {canManage && (
                        <div className="flex flex-shrink-0 items-center gap-1">
                          <FoodDishCategoryFormDialog category={c} />
                          <FoodDishCategoryDeleteButton categoryId={c.id} categoryName={c.name} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{f.modifierGroups}</CardTitle>
              {canManage && <FoodModifierGroupFormDialog />}
            </CardHeader>
            <CardContent className="p-0">
              {modifierGroups.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={SlidersHorizontal}
                    title={f.noModifierGroupsYet}
                    description={f.noModifierGroupsDesc}
                  />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {modifierGroups.map((g) => (
                    <li key={g.id} className="px-6 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-medium text-slate-900">{g.name}</p>
                          <span className="text-xs text-slate-400">
                            {f.dishCount(g.dishCount)}
                          </span>
                        </div>
                        {canManage && (
                          <div className="flex flex-shrink-0 items-center gap-1">
                            <FoodModifierGroupFormDialog group={g} />
                            <FoodModifierGroupDeleteButton groupId={g.id} groupName={g.name} />
                          </div>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {g.options.map((o) => `${o.name}${o.priceDelta > 0 ? ` (+$${o.priceDelta.toFixed(2)})` : ""}`).join(", ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {usesPos ? (
            <PosLockedNotice title={f.posLockedTitle} description={f.posLockedDishDesc} />
          ) : !canManage ? (
            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">{f.viewOnlyNotice}</p>
          ) : (
            <FoodDailyDishSalesForm
              variants={activeVariants.map((v) => ({ variantId: v.id, displayName: v.displayName, todayQuantity: todayQtyByVariant.get(v.id) ?? 0 }))}
            />
          )}
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{f.recalcTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <FoodRecipeRecalcForm />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
