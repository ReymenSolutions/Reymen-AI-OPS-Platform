import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { getFoodSalesSummary, getFoodSalesByChannel } from "@/lib/food";
import { getServerLang, getServerT } from "@/lib/i18n-server";
import { foodStrings } from "@/lib/i18n-food";
import { pickDict } from "@/lib/i18n-dict";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { BarChart3, DollarSign } from "lucide-react";

const money = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

export default async function FoodAnalyticsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;

  const [t, lang, summary, byChannel] = await Promise.all([
    getServerT(),
    getServerLang(),
    getFoodSalesSummary(orgId),
    getFoodSalesByChannel(orgId),
  ]);

  const f = pickDict(foodStrings, lang);
  const totalChannelGross = byChannel.reduce((sum, c) => sum + c.gross, 0);

  return (
    <div>
      <PageHeader title={t.foodAnalytics} description={f.analyticsPageDesc} />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          title={f.gross30}
          value={money(summary.last30Days.gross)}
          icon={DollarSign}
          trend={summary.monthOverMonthGrossPct !== null ? { value: summary.monthOverMonthGrossPct, label: f.vsPrev30Days } : undefined}
        />
        <MetricCard title={f.net30} value={money(summary.last30Days.net)} icon={DollarSign} />
        <MetricCard title={f.salesCount30} value={summary.last30Days.count} icon={BarChart3} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{f.salesByChannel30}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {byChannel.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={BarChart3} title={f.noDataYet} description={f.noChannelDataDesc} />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byChannel.map((c) => {
                const pct = totalChannelGross > 0 ? Math.round((c.gross / totalChannelGross) * 100) : 0;
                return (
                  <li key={c.channel ?? ""} className="px-6 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-900">{c.channel ?? f.noChannel}</span>
                      <span className="text-slate-500">{money(c.gross)} · {f.salesCount(c.count)}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
