import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getFoodSalesSummary } from "@/lib/food";
import { createFoodSale } from "@/actions/food";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDateTime } from "@/lib/utils";
import { DollarSign } from "lucide-react";

const money = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

export default async function FoodSalesPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;

  const [t, summary, recentSales] = await Promise.all([
    getServerT(),
    getFoodSalesSummary(orgId),
    prisma.foodSale.findMany({
      where: { organizationId: orgId },
      orderBy: { occurredAt: "desc" },
      take: 25,
    }),
  ]);

  return (
    <div>
      <PageHeader title={t.foodSales} description="Registro de ventas, comparación diaria/semanal/mensual." />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard title="Hoy" value={money(summary.today.gross)} description={`${summary.today.count} venta(s) · bruto`} icon={DollarSign} />
        <MetricCard title="Últimos 7 días" value={money(summary.last7Days.gross)} description={`${summary.last7Days.count} venta(s) · bruto`} icon={DollarSign} />
        <MetricCard
          title="Últimos 30 días"
          value={money(summary.last30Days.gross)}
          description={`Neto: ${money(summary.last30Days.net)}`}
          icon={DollarSign}
          trend={summary.monthOverMonthGrossPct !== null ? { value: summary.monthOverMonthGrossPct, label: "vs. 30 días previos" } : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ventas recientes</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentSales.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={DollarSign} title="Sin ventas todavía" description="Registra tu primera venta con el formulario de la derecha." />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentSales.map((sale) => (
                    <li key={sale.id} className="flex items-center justify-between px-6 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{formatDateTime(sale.occurredAt)}</p>
                        <p className="text-xs text-slate-500">{sale.channel ?? "Sin canal"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">{money(Number(sale.grossAmount))}</p>
                        <p className="text-xs text-slate-500">Neto: {money(Number(sale.netAmount))}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registrar venta</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createFoodSale} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="occurredAt" className="text-xs font-medium text-slate-600">Fecha</label>
                <input
                  id="occurredAt" name="occurredAt" type="datetime-local" required
                  defaultValue={new Date().toISOString().slice(0, 16)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="channel" className="text-xs font-medium text-slate-600">Canal</label>
                <input id="channel" name="channel" type="text" placeholder="Mostrador, domicilio, app..." className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="grossAmount" className="text-xs font-medium text-slate-600">Bruto</label>
                  <input id="grossAmount" name="grossAmount" type="number" step="0.01" min="0" required className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="netAmount" className="text-xs font-medium text-slate-600">Neto</label>
                  <input id="netAmount" name="netAmount" type="number" step="0.01" min="0" required className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="notes" className="text-xs font-medium text-slate-600">Notas</label>
                <textarea id="notes" name="notes" rows={2} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <button type="submit" className="mt-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
                Guardar venta
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
