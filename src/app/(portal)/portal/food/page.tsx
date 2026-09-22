import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import {
  getFoodSalesSummary, getFoodHourlySales, getFoodLowStockItems, getFoodDailySales,
} from "@/lib/food";
import { getSmartcardCompanyIdForOrg, getCompanyCardStats } from "@/lib/smartcard-company";
import { getServerT } from "@/lib/i18n-server";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DollarSign, Package, ChefHat, ClipboardList, BarChart3, ArrowRight, Receipt, Clock,
  ArrowUpRight, ArrowDownRight, QrCode, MessageCircle, Star, MapPin, ShoppingBag,
  TrendingUp, Sparkles, Truck, Users,
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

// ─── Datos de ejemplo, marcados como tal en la UI ─────────────────────
// Food no tiene todavía modelo de platillos/menú ni de registro de
// compras (FoodSupplier es solo un directorio de contacto), así que estos
// dos bloques se muestran con datos de prueba explícitos -- decisión
// tomada con el cliente/socio el 2026-09-21, no se presentan en ningún
// punto como si vinieran de una consulta real.
const DEMO_TOP_DISHES = [
  { name: "Tacos al pastor", emoji: "🌮", orders: 48, revenue: 7680 },
  { name: "Hamburguesa clásica", emoji: "🍔", orders: 36, revenue: 5760 },
  { name: "Ensalada mediterránea", emoji: "🥗", orders: 28, revenue: 4480 },
  { name: "Pizza margarita", emoji: "🍕", orders: 24, revenue: 3840 },
  { name: "Pasta alfredo", emoji: "🍝", orders: 22, revenue: 3520 },
] as const;

const DEMO_RECENT_PURCHASES = [
  { item: "Ribeye de res", supplier: "Carnes del Norte", date: "20 sep", total: 3250 },
  { item: "Queso mozzarella", supplier: "Lácteos del Bajío", date: "19 sep", total: 1980 },
  { item: "Tomate saladet", supplier: "AgroMart", date: "19 sep", total: 720 },
  { item: "Lechuga romana", supplier: "Campos Verdes", date: "18 sep", total: 480 },
  { item: "Aceite de oliva", supplier: "De la Toscana", date: "17 sep", total: 950 },
] as const;

function DemoBadge() {
  return <Badge variant="warning">Datos de ejemplo</Badge>;
}

function money(n: number, opts: Intl.NumberFormatOptions = {}) {
  return `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2, ...opts })}`;
}

// ─── Sparkline mínimo, sin dependencias -- una sola serie, un solo trazo ──
function Sparkline({ points, positive }: { points: number[]; positive: boolean | null }) {
  if (points.length < 2) return null;
  const w = 64;
  const h = 24;
  const max = Math.max(...points);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points
    .map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
  const stroke = positive === false ? "#dc2626" : "#fb923c";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible" aria-hidden="true">
      <polyline points={coords} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface FoodKpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  description?: string;
  trendPct?: number | null;
  trendLabel?: string;
  sparkline?: number[];
  accent?: "orange" | "brand" | "red";
}

function FoodKpiCard({ icon: Icon, label, value, description, trendPct, trendLabel, sparkline, accent = "brand" }: FoodKpiCardProps) {
  const positive = typeof trendPct === "number" ? trendPct >= 0 : null;
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              accent === "orange" && "bg-orange-50",
              accent === "brand" && "bg-brand-50",
              accent === "red" && "bg-red-50"
            )}
          >
            <Icon className={cn("h-5 w-5", accent === "orange" && "text-orange-500", accent === "brand" && "text-brand-600", accent === "red" && "text-red-500")} />
          </div>
          {sparkline && <Sparkline points={sparkline} positive={positive} />}
        </div>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        {description && !trendLabel && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        {typeof trendPct === "number" && trendLabel && (
          <p className={cn("mt-1.5 inline-flex items-center gap-1 text-xs font-semibold", positive ? "text-emerald-600" : "text-red-600")}>
            {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {positive ? "+" : ""}
            {trendPct}% {trendLabel}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function FoodOverviewPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "FOOD_OPS");

  const orgId = session.user.organizationId;

  const [t, summary, hourly, daily, lowStock, smartcardCompanyId] = await Promise.all([
    getServerT(),
    getFoodSalesSummary(orgId),
    getFoodHourlySales(orgId),
    getFoodDailySales(orgId, 7),
    getFoodLowStockItems(orgId, 5),
    getSmartcardCompanyIdForOrg(orgId),
  ]);

  const cardStats = smartcardCompanyId ? await getCompanyCardStats(smartcardCompanyId) : null;
  const realScans = cardStats?.byType["qr_scan"] ?? 0;
  const realWhatsapp = cardStats?.byType["whatsapp_click"] ?? 0;

  const avgTicketToday = summary.today.count > 0 ? summary.today.gross / summary.today.count : 0;

  const chartHours = hourly.filter((h) => h.hour >= CHART_START_HOUR && h.hour <= CHART_END_HOUR);
  const maxHourlyGross = Math.max(...chartHours.map((h) => h.gross), 0);

  const grossSpark = daily.map((d) => d.gross);
  const ordersSpark = daily.map((d) => d.count);
  const ticketSpark = daily.map((d) => (d.count > 0 ? d.gross / d.count : 0));

  const todayLabel = new Date().toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });

  return (
    <div>
      {/* ── Header principal ─────────────────────────────────────────── */}
      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 px-6 py-6 text-white sm:px-8 sm:py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">Bienvenido</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">REYMEN Ops Food</h1>
            <p className="mt-1 text-sm text-brand-200">Panel para restaurante</p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <p className="text-sm italic text-brand-100">&ldquo;Grandes sabores. Mejores negocios.&rdquo;</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
              <Clock className="h-3.5 w-3.5" />
              Hoy · {todayLabel}
            </span>
          </div>
        </div>
      </div>

      {/* ── KPIs superiores ──────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FoodKpiCard
          icon={DollarSign}
          label="Ventas de hoy"
          value={money(summary.today.gross)}
          trendPct={summary.vsYesterdayGrossPct}
          trendLabel="vs. ayer"
          sparkline={grossSpark}
          accent="orange"
        />
        <FoodKpiCard
          icon={Receipt}
          label="Ticket promedio"
          value={money(avgTicketToday)}
          trendPct={summary.vsYesterdayTicketPct}
          trendLabel="vs. ayer"
          sparkline={ticketSpark}
        />
        <FoodKpiCard
          icon={ShoppingBag}
          label="Pedidos de hoy"
          value={String(summary.today.count)}
          trendPct={summary.vsYesterdayOrdersPct}
          trendLabel="vs. ayer"
          sparkline={ordersSpark}
        />
        <FoodKpiCard
          icon={Package}
          label="Insumos en stock bajo"
          value={String(lowStock.length)}
          description="En o bajo el mínimo"
          accent={lowStock.length > 0 ? "red" : "brand"}
        />
      </div>

      {/* ── Composición principal ────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Ventas por hora */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base">Ventas por hora</CardTitle>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Hoy</span>
          </CardHeader>
          <CardContent>
            {summary.today.count === 0 ? (
              <p className="rounded-md bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                Todavía no hay ventas registradas hoy.
              </p>
            ) : (
              <div className="flex items-end gap-1 border-b border-slate-100 pb-0">
                {chartHours.map((h) => {
                  // Altura en px directa, no porcentaje: un % de altura solo
                  // funciona si el contenedor inmediato tiene una altura
                  // definida, y aquí cada columna es un flex item con altura
                  // automática (se alinean por abajo vía items-end en el
                  // padre) -- un % ahí siempre resuelve a 0. Con px fijos se
                  // evita el problema por completo.
                  const barPx = maxHourlyGross > 0 ? Math.max(4, Math.round((h.gross / maxHourlyGross) * 140)) : 0;
                  const isPeak = h.gross === maxHourlyGross && h.gross > 0;
                  return (
                    <div key={h.hour} className="group flex flex-1 flex-col items-center gap-1">
                      <span className="h-3 text-[10px] font-medium text-slate-600">
                        {isPeak ? `$${h.gross.toLocaleString("es-MX", { maximumFractionDigits: 0 })}` : ""}
                      </span>
                      <div
                        className={cn(
                          "w-full rounded-t-sm transition-colors",
                          isPeak ? "bg-orange-500" : "bg-orange-300 group-hover:bg-orange-400"
                        )}
                        style={{ height: `${barPx}px` }}
                        title={`${h.hour}:00 — $${h.gross.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${h.count} venta(s))`}
                      />
                      <span className="text-[10px] text-slate-400">{h.hour}h</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Platillos más vendidos -- demo */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <ChefHat className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base">Platillos más vendidos</CardTitle>
            </div>
            <DemoBadge />
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {DEMO_TOP_DISHES.map((dish, i) => (
                <li key={dish.name} className="flex items-center gap-3 px-6 py-2.5">
                  <span className="w-4 text-xs font-semibold text-slate-400">{i + 1}</span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-lg">
                    {dish.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{dish.name}</p>
                    <p className="text-xs text-slate-500">{dish.orders} pedidos</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{money(dish.revenue, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-100 px-6 py-2.5">
              <Link href="/portal/food/sales" className="text-xs font-medium text-brand-600 hover:underline">
                Ver todos →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* SmartCard Restaurante -- widget real, parte de Food */}
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">SmartCard Restaurante</CardTitle>
            <Link href="/portal/smartcard" className="text-xs font-medium text-brand-600 hover:underline">
              Ver detalle →
            </Link>
          </CardHeader>
          <CardContent>
            {/* Parte visual */}
            <div className="mb-4 rounded-xl bg-gradient-to-br from-brand-900 to-brand-950 p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-200">Reymen Solutions</p>
                  <p className="mt-2 text-sm font-medium">Tu menú, en un solo toque.</p>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white">
                  <QrCode className="h-7 w-7 text-brand-900" />
                </div>
              </div>
            </div>

            {/* Parte funcional */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <QrCode className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Escaneos</span>
                </div>
                <p className="mt-1 text-lg font-bold text-slate-900">{realScans.toLocaleString("es-MX")}</p>
              </div>
              <div className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Clics a WhatsApp</span>
                </div>
                <p className="mt-1 text-lg font-bold text-slate-900">{realWhatsapp.toLocaleString("es-MX")}</p>
              </div>
              <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/40 p-3">
                <div className="flex items-center justify-between text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">Reseñas</span>
                  </div>
                  <span className="text-[9px] font-semibold uppercase text-amber-600">Demo</span>
                </div>
                <p className="mt-1 text-lg font-bold text-slate-900">156</p>
              </div>
              <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/40 p-3">
                <div className="flex items-center justify-between text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-medium">Clics a ubicación</span>
                  </div>
                  <span className="text-[9px] font-semibold uppercase text-amber-600">Demo</span>
                </div>
                <p className="mt-1 text-lg font-bold text-slate-900">412</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Fila inferior ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Inventario bajo */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base">Inventario bajo</CardTitle>
            </div>
            <Link href="/portal/food/inventory" className="text-xs font-medium text-brand-600 hover:underline">
              Ver inventario →
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {lowStock.length === 0 ? (
              <p className="px-6 py-4 text-sm text-slate-500">Todos los insumos están por arriba de su mínimo.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lowStock.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-6 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50">
                      <Package className="h-4 w-4 text-red-500" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.currentStock} / {item.minStock} {item.unit}
                      </p>
                    </div>
                    <Badge variant="destructive" className="text-[10px]">Bajo</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Compras recientes -- demo */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-slate-400" />
              <CardTitle className="text-base">Compras recientes</CardTitle>
            </div>
            <DemoBadge />
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {DEMO_RECENT_PURCHASES.map((p) => (
                <li key={p.item} className="flex items-center gap-3 px-6 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                    <ShoppingBag className="h-4 w-4 text-slate-400" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{p.item}</p>
                    <p className="truncate text-xs text-slate-500">{p.supplier} · {p.date}</p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{money(p.total, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-100 px-6 py-2.5">
              <Link href="/portal/food/suppliers" className="text-xs font-medium text-brand-600 hover:underline">
                Ver todas →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Insights del mes -- todo real */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Insights del mes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">Ventas</p>
                <p className={cn("mt-0.5 text-sm font-bold", (summary.monthOverMonthGrossPct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {summary.monthOverMonthGrossPct !== null ? `${summary.monthOverMonthGrossPct >= 0 ? "+" : ""}${summary.monthOverMonthGrossPct}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">Pedidos</p>
                <p className={cn("mt-0.5 text-sm font-bold", (summary.monthOverMonthOrdersPct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {summary.monthOverMonthOrdersPct !== null ? `${summary.monthOverMonthOrdersPct >= 0 ? "+" : ""}${summary.monthOverMonthOrdersPct}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">Ticket promedio</p>
                <p className={cn("mt-0.5 text-sm font-bold", (summary.monthOverMonthTicketPct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {summary.monthOverMonthTicketPct !== null ? `${summary.monthOverMonthTicketPct >= 0 ? "+" : ""}${summary.monthOverMonthTicketPct}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[11px] font-medium text-slate-500">Insumos bajo</p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">{lowStock.length}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-900 to-brand-950 p-3 text-white">
              <Sparkles className="h-4 w-4 shrink-0 text-orange-300" />
              <p className="text-xs font-medium">Cocina inteligente. Negocios más fuertes.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
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
