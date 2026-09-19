import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { getFoodSalesSummary } from "@/lib/food";
import { prisma } from "@/lib/prisma";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DollarSign, Package, Users, ChefHat, ClipboardList, BarChart3, ArrowRight,
} from "lucide-react";

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

  const [t, summary, lowStockCount] = await Promise.all([
    getServerT(),
    getFoodSalesSummary(session.user.organizationId),
    prisma.foodInventoryItem.count({
      where: {
        organizationId: session.user.organizationId,
        // Prisma no compara dos columnas directo en `where` -- se filtra
        // exacto (stock en 0) aquí y el resto (stock > 0 pero bajo mínimo)
        // se cuenta en la propia página de inventario, que sí puede
        // comparar en JS después del fetch. Este número es solo la señal
        // más urgente para la tarjeta de resumen.
        currentStock: { lte: 0 },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader title={t.food} description="Ventas, inventario y proveedores de tu operación de alimentos." />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Ventas de hoy"
          value={`$${summary.today.gross.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
          description={`${summary.today.count} venta(s)`}
          icon={DollarSign}
        />
        <MetricCard
          title="Últimos 7 días"
          value={`$${summary.last7Days.gross.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
          description={`${summary.last7Days.count} venta(s)`}
          icon={DollarSign}
        />
        <MetricCard
          title="Últimos 30 días"
          value={`$${summary.last30Days.gross.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
          description="Bruto"
          icon={DollarSign}
          trend={
            summary.monthOverMonthGrossPct !== null
              ? { value: summary.monthOverMonthGrossPct, label: "vs. 30 días previos" }
              : undefined
          }
        />
        <MetricCard
          title="Insumos agotados"
          value={lowStockCount}
          description="Sin stock (0 o menos)"
          icon={Package}
          iconClassName={lowStockCount > 0 ? "bg-red-50" : undefined}
        />
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
