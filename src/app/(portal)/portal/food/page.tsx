import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { getFoodSalesSummary, getFoodHourlySales, getFoodLowStockItems } from "@/lib/food";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, Package, Users, ChefHat, ClipboardList, BarChart3, ArrowRight, Receipt, Clock,
} from "lucide-react";

// Ventana de horario de restaurante que se grafica -- las ventas fuera de
// este rango siguen contando en los totales del día, solo no se dibujan
// como barra individual (mismo criterio visual que el dashboard de
// referencia del negocio: 6:00 a 23:00).
const CHART_START_HOUR = 6;
const CHART_END_HOUR = 23;

const AREAS = [
  { href: "/portal/food/sales", key: "foodSales", icon: DollarSign, ready: true },
  { href: "/portal/food/inventory", key: "foodInventory", icon: Package, ready: true },
  { href: "/portal/food/suppliers", key: "foodSuppliers", icon: Users, ready: true },
  { href: "/portal/food/recipes", key: "foodRecipes", icon: ChefHat, ready: false },
  { href: "/portal/food/operations", key: "foodOperations", icon: ClipboardList, ready: false },
  { href: "/portal/food/analytics", key: "foodAnalytics", icon: BarChart3, ready: true },
] as const;

export default async function FoodOverviewPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const [t, summary, hourly, lowStock] = await Promise.all([
    getServerT(),
    getFoodSalesSummary(session.user.organizationId),
    getFoodHourlySales(session.user.organizationId),
    getFoodLowStockItems(session.user.organizationId, 5),
  ]);

  const avgTicketToday = summary.today.count > 0 ? summary.today.gross / summary.today.count : 0;

  const chartHours = hourly.filter((h) => h.hour >= CHART_START_HOUR && h.hour <= CHART_END_HOUR);
  const maxHourlyGross = Math.max(...chartHours.map((h) => h.gross), 0);

  return (
    <div>
      <PageHeader title={t.food} description="Ventas, inventario y proveedores de tu operación de alimentos." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Ventas de hoy"
          value={`$${summary.today.gross.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
          description="Bruto"
          icon={DollarSign}
        />
        <MetricCard
          title="Ticket promedio"
          value={`$${avgTicketToday.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
          description="Hoy"
          icon={Receipt}
          trend={
            summary.monthOverMonthTicketPct !== null
              ? { value: summary.monthOverMonthTicketPct, label: "vs. 30 días previos" }
              : undefined
          }
        />
        <MetricCard
          title="Pedidos de hoy"
          value={summary.today.count}
          description="Ventas registradas hoy"
          icon={Users}
          trend={
            summary.monthOverMonthOrdersPct !== null
              ? { value: summary.monthOverMonthOrdersPct, label: "vs. 30 días previos" }
              : undefined
          }
        />
        <MetricCard
          title="Insumos en stock bajo"
          value={lowStock.length}
          description="En o bajo el mínimo"
          icon={Package}
          iconClassName={lowStock.length > 0 ? "bg-red-50" : undefined}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            <CardTitle className="text-base">Ventas por hora — hoy</CardTitle>
          </CardHeader>
          <CardContent>
            {summary.today.count === 0 ? (
              <p className="rounded-md bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                Todavía no hay ventas registradas hoy.
              </p>
            ) : (
              <div className="flex h-40 items-end gap-1">
                {chartHours.map((h) => {
                  const heightPct = maxHourlyGross > 0 ? Math.max(4, (h.gross / maxHourlyGross) * 100) : 0;
                  const isPeak = h.gross === maxHourlyGross && h.gross > 0;
                  return (
                    <div key={h.hour} className="flex flex-1 flex-col items-center justify-end gap-1">
                      {isPeak && (
                        <span className="text-[10px] font-medium text-slate-600">
                          ${h.gross.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
                        </span>
                      )}
                      <div
                        className="w-full rounded-t-sm bg-brand-500"
                        style={{ height: `${heightPct}%` }}
                        title={`${h.hour}:00 — $${h.gross.toLocaleString("es-MX", { minimumFractionDigits: 2 })} (${h.count} venta(s))`}
                      />
                      <span className="text-[10px] text-slate-400">{h.hour}h</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base">Insumos con stock bajo</CardTitle>
            </div>
            <Link href="/portal/food/inventory" className="text-xs font-medium text-brand-600 hover:underline">
              Ver todo
            </Link>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-slate-500">Todos los insumos están por arriba de su mínimo.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {lowStock.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-2">
                    <span className="text-slate-700">{item.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-500">
                        {item.currentStock} / {item.minStock} {item.unit}
                      </span>
                      <Badge variant="destructive" className="text-xs">
                        Bajo
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ventas — últimos 30 días</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">
              ${summary.last30Days.gross.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </p>
            {summary.monthOverMonthGrossPct !== null && (
              <p className={`mt-1 text-xs font-medium ${summary.monthOverMonthGrossPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {summary.monthOverMonthGrossPct >= 0 ? "+" : ""}
                {summary.monthOverMonthGrossPct}% vs. 30 días previos
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pedidos — últimos 30 días</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">{summary.last30Days.count}</p>
            {summary.monthOverMonthOrdersPct !== null && (
              <p className={`mt-1 text-xs font-medium ${summary.monthOverMonthOrdersPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {summary.monthOverMonthOrdersPct >= 0 ? "+" : ""}
                {summary.monthOverMonthOrdersPct}% vs. 30 días previos
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ticket promedio — últimos 30 días</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-slate-900">
              ${(summary.last30Days.count > 0 ? summary.last30Days.gross / summary.last30Days.count : 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
            </p>
            {summary.monthOverMonthTicketPct !== null && (
              <p className={`mt-1 text-xs font-medium ${summary.monthOverMonthTicketPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {summary.monthOverMonthTicketPct >= 0 ? "+" : ""}
                {summary.monthOverMonthTicketPct}% vs. 30 días previos
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Áreas del módulo</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AREAS.map((area) => {
            const Icon = area.icon;
            return (
              <Link
                key={area.href}
                href={area.href}
                className="flex items-center justify-between rounded-lg border border-slate-200 p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
              >
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-brand-50 p-2">
                    <Icon className="h-4 w-4 text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{t[area.key]}</p>
                    {!area.ready && <p className="text-xs text-slate-400">Próximamente</p>}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
