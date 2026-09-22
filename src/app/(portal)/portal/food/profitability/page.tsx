import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import {
  getFoodOperatingCosts, getTotalMonthlyFixedCosts, getFoodBreakEven, getFoodNetProfit,
  getFoodCostReductionInsights, getFoodProfitRecommendations, getFoodLeastSoldDishes,
  getFoodDishesWithCost,
} from "@/lib/food";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { FoodOperatingCostFormDialog } from "@/components/portal/FoodOperatingCostFormDialog";
import { FoodOperatingCostToggle } from "@/components/portal/FoodOperatingCostToggle";
import { FoodNetProfitPanel } from "@/components/portal/FoodNetProfitPanel";
import { FoodPriceCalculator } from "@/components/portal/FoodPriceCalculator";
import { cn } from "@/lib/utils";
import { Wallet, Target, TrendingDown, TrendingUp, Megaphone } from "lucide-react";

const money = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function marginColor(marginPct: number | null): string {
  if (marginPct === null) return "text-slate-400";
  if (marginPct < 15) return "text-red-600";
  if (marginPct < 30) return "text-amber-600";
  return "text-emerald-600";
}

const RECOMMENDATION_STYLE: Record<string, { badge: "destructive" | "warning" | "info"; label: string }> = {
  review_urgent: { badge: "destructive", label: "Urgente" },
  raise_price_or_cut_cost: { badge: "warning", label: "Subir precio / bajar costo" },
  promote: { badge: "info", label: "Promocionar" },
};

export default async function FoodProfitabilityPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;

  const [
    t, operatingCosts, fixedCostsMonthly, breakEven, profitToday, profit7d, profit30d,
    costInsights, recommendations, leastSold, dishesWithCost, org,
  ] = await Promise.all([
    getServerT(),
    getFoodOperatingCosts(orgId),
    getTotalMonthlyFixedCosts(orgId),
    getFoodBreakEven(orgId),
    getFoodNetProfit(orgId, "today"),
    getFoodNetProfit(orgId, "7d"),
    getFoodNetProfit(orgId, "30d"),
    getFoodCostReductionInsights(orgId),
    getFoodProfitRecommendations(orgId),
    getFoodLeastSoldDishes(orgId, 30, 5),
    getFoodDishesWithCost(orgId, { activeOnly: true }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { foodTargetCostPct: true } }),
  ]);

  return (
    <div>
      <PageHeader title={t.foodProfitability} description="Costos operativos, punto de equilibrio y utilidad de tu operación." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Gastos fijos */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-base">Gastos fijos mensuales</CardTitle>
              </div>
              <FoodOperatingCostFormDialog />
            </CardHeader>
            <CardContent className="p-0">
              {operatingCosts.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={Wallet} title="Sin gastos fijos registrados" description="Agrega renta, nómina, servicios, etc. con el botón de arriba." />
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-slate-100">
                    {operatingCosts.map((cost) => (
                      <li key={cost.id} className={cn("flex items-center justify-between px-6 py-3", !cost.isActive && "opacity-50")}>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900">{cost.name}</p>
                          {!cost.isActive && <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">{money(cost.amountMonthly)}</p>
                          <FoodOperatingCostFormDialog cost={cost} />
                          <FoodOperatingCostToggle costId={cost.id} isActive={cost.isActive} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3">
                    <p className="text-sm font-medium text-slate-700">Total mensual (activos)</p>
                    <p className="text-base font-bold text-slate-900">{money(fixedCostsMonthly)}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Punto de equilibrio */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-base">Punto de equilibrio</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {breakEven.blended && (
                <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
                  <p className="text-xs font-medium text-brand-700">
                    Combinado (según tu mezcla real de ventas de los últimos {breakEven.blended.basedOnDays} días)
                  </p>
                  <p className="mt-1 text-lg font-bold text-brand-900">
                    {breakEven.blended.breakEvenUnits.toLocaleString("es-MX")} unidades · {money(breakEven.blended.breakEvenRevenue)}
                  </p>
                </div>
              )}
              {breakEven.perDish.length === 0 ? (
                <p className="text-sm text-slate-500">Crea platillos en Recetas para ver su punto de equilibrio aquí.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                        <th className="py-2 pr-3">Platillo</th>
                        <th className="py-2 pr-3">Margen</th>
                        <th className="py-2">Unidades para cubrir gastos fijos (solo)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {breakEven.perDish.map((row) => (
                        <tr key={row.dishId}>
                          <td className="py-2 pr-3 font-medium text-slate-900">{row.name}</td>
                          <td className="py-2 pr-3">{money(row.contributionMargin)}</td>
                          <td className="py-2">
                            {row.breakEvenUnits !== null ? (
                              `${row.breakEvenUnits.toLocaleString("es-MX")} unidades`
                            ) : (
                              <span className="text-red-600">Nunca solo (margen ≤ 0)</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Utilidad neta */}
          <FoodNetProfitPanel data={{ today: profitToday, "7d": profit7d, "30d": profit30d }} />

          {/* Reducción de costos */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-base">Reducción de costos</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {costInsights.lowestMarginDishes.length === 0 && costInsights.topCostIngredients.length === 0 ? (
                <p className="text-sm text-slate-500">Crea platillos con receta en Recetas para ver estos insights.</p>
              ) : (
                <>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Platillos con menor margen</p>
                    <ul className="space-y-1.5">
                      {costInsights.lowestMarginDishes.map((d) => (
                        <li key={d.dishId} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{d.name}</span>
                          <span className={cn("font-medium", marginColor(d.marginPct))}>{d.marginPct !== null ? `${d.marginPct}%` : "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Insumos que más pesan en tus recetas</p>
                    <ul className="space-y-1.5">
                      {costInsights.topCostIngredients.map((i) => (
                        <li key={i.inventoryItemId} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{i.name}</span>
                          <span className="font-medium text-slate-900">{money(i.totalRecipeCost)} · en {i.usedInDishes} platillo(s)</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Mejorar utilidad */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-base">Recomendaciones para mejorar utilidad</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {recommendations.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Sin recomendaciones por ahora — registra ventas de platillos en Recetas para que aparezcan aquí.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recommendations.map((rec, i) => {
                    const style = RECOMMENDATION_STYLE[rec.type];
                    return (
                      <li key={`${rec.dishId}-${i}`} className="flex items-start gap-2">
                        <Badge variant={style.badge as "destructive" | "warning" | "info"} className="mt-0.5 flex-shrink-0 text-[10px]">
                          {style.label}
                        </Badge>
                        <p className="text-sm text-slate-700">
                          <span className="font-medium text-slate-900">{rec.dishName}:</span> {rec.reason}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Promociones recomendadas */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-base">Promociones recomendadas</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {leastSold.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Registra ventas de platillos en Recetas para ver aquí cuáles se venden menos y merecen una promoción.
                </p>
              ) : (
                <ul className="space-y-2">
                  {leastSold.map((d) => (
                    <li key={d.dishId} className="rounded-md bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-900">{d.name}</span>
                        <span className="text-slate-500">{d.unitsSold} vendidos en 30 días</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Considera un descuento o un combo con tu platillo más popular para darle salida.
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <FoodPriceCalculator
            dishes={dishesWithCost.map((d) => ({ id: d.id, name: d.name, cost: d.cost }))}
            initialTargetPct={org?.foodTargetCostPct ?? 30}
          />
        </div>
      </div>
    </div>
  );
}
