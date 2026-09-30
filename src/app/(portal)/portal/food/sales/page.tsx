import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getFoodSalesSummary } from "@/lib/food";
import { createFoodSale } from "@/actions/food";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
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

  const [t, lang, summary, recentSales] = await Promise.all([
    getServerT(),
    getServerLang(),
    getFoodSalesSummary(orgId),
    prisma.foodSale.findMany({
      where: { organizationId: orgId },
      orderBy: { occurredAt: "desc" },
      take: 25,
    }),
  ]);

  const f = pickDict(foodStrings, lang);

  return (
    <div>
      <PageHeader title={t.foodSales} description={f.salesPageDesc} />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard title={f.today} value={money(summary.today.gross)} description={f.salesCountGross(summary.today.count)} icon={DollarSign} />
        <MetricCard title={f.last7Days} value={money(summary.last7Days.gross)} description={f.salesCountGross(summary.last7Days.count)} icon={DollarSign} />
        <MetricCard
          title={f.last30Days}
          value={money(summary.last30Days.gross)}
          description={f.netLabel(money(summary.last30Days.net))}
          icon={DollarSign}
          trend={summary.monthOverMonthGrossPct !== null ? { value: summary.monthOverMonthGrossPct, label: f.vsPrev30Days } : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{f.recentSales}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recentSales.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={DollarSign} title={f.noSalesYet} description={f.noSalesYetDesc} />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentSales.map((sale) => (
                    <li key={sale.id} className="flex items-center justify-between px-6 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{formatDateTime(sale.occurredAt)}</p>
                        <p className="text-xs text-slate-500">{sale.channel ?? f.noChannel}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-900">{money(Number(sale.grossAmount))}</p>
                        <p className="text-xs text-slate-500">{f.netLabel(money(Number(sale.netAmount)))}</p>
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
            <CardTitle className="text-base">{f.recordSale}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createFoodSale} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="occurredAt" className="text-xs font-medium text-slate-600">{f.date}</label>
                <input
                  id="occurredAt" name="occurredAt" type="datetime-local" required
                  defaultValue={new Date().toISOString().slice(0, 16)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="channel" className="text-xs font-medium text-slate-600">{f.channel}</label>
                <input id="channel" name="channel" type="text" placeholder={f.channelPlaceholder} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="grossAmount" className="text-xs font-medium text-slate-600">{f.gross}</label>
                  <input id="grossAmount" name="grossAmount" type="number" step="0.01" min="0" required className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label htmlFor="netAmount" className="text-xs font-medium text-slate-600">{f.netNoTax}</label>
                  <input id="netAmount" name="netAmount" type="number" step="0.01" min="0" required className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="notes" className="text-xs font-medium text-slate-600">{f.notes}</label>
                <textarea id="notes" name="notes" rows={2} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </div>
              <button type="submit" className="mt-1 rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
                {f.saveSale}
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
