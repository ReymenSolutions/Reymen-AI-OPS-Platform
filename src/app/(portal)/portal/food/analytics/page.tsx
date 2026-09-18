import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { getFoodSalesSummary, getFoodSalesByChannel } from "@/lib/food";
import { getServerT } from "@/lib/i18n-server";
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

  const [t, summary, byChannel] = await Promise.all([
    getServerT(),
    getFoodSalesSummary(orgId),
    getFoodSalesByChannel(orgId),
  ]);

  const totalChannelGross = byChannel.reduce((sum, c) => sum + c.gross, 0);

  return (
    <div>
      <PageHeader title={t.foodAnalytics} description="Ventas de los últimos 30 días. Recetas, consumo y costos se integran cuando esos módulos tengan modelo propio." />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          title="Bruto (30 días)"
          value={money(summary.last30Days.gross)}
          icon={DollarSign}
          trend={summary.monthOverMonthGrossPct !== null ? { value: summary.monthOverMonthGrossPct, label: "vs. 30 días previos" } : undefined}
        />
        <MetricCard title="Neto (30 días)" value={money(summary.last30Days.net)} icon={DollarSign} />
        <MetricCard title="Ventas registradas (30 días)" value={summary.last30Days.count} icon={BarChart3} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventas por canal (30 días)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {byChannel.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={BarChart3} title="Sin datos todavía" description="Registra ventas para ver el desglose por canal aquí." />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byChannel.map((c) => {
                const pct = totalChannelGross > 0 ? Math.round((c.gross / totalChannelGross) * 100) : 0;
                return (
                  <li key={c.channel} className="px-6 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-900">{c.channel}</span>
                      <span className="text-slate-500">{money(c.gross)} · {c.count} venta(s)</span>
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
