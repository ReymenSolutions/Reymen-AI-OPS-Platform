"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";

export interface FoodNetProfitByPeriod {
  today: { revenue: number; cogs: number; fixedCostsProrated: number; netProfit: number; coverage: { itemsWithSales: number; totalActiveItems: number } };
  "7d": { revenue: number; cogs: number; fixedCostsProrated: number; netProfit: number; coverage: { itemsWithSales: number; totalActiveItems: number } };
  "30d": { revenue: number; cogs: number; fixedCostsProrated: number; netProfit: number; coverage: { itemsWithSales: number; totalActiveItems: number } };
}

const money = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function FoodNetProfitPanel({ data }: { data: FoodNetProfitByPeriod }) {
  const { lang } = usePreferences();
  const [period, setPeriod] = useState<keyof FoodNetProfitByPeriod>("30d");
  const current = data[period];

  const labels: Record<keyof FoodNetProfitByPeriod, string> = {
    today: lang === "es" ? "Hoy" : "Today",
    "7d": lang === "es" ? "7 días" : "7 days",
    "30d": lang === "es" ? "30 días" : "30 days",
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{lang === "es" ? "Utilidad neta" : "Net profit"}</CardTitle>
        <div className="flex rounded-md border border-slate-200 overflow-hidden">
          {(Object.keys(data) as (keyof FoodNetProfitByPeriod)[]).map((key) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium transition-colors",
                period === key ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              {labels[key]}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-[11px] font-medium text-slate-500">{lang === "es" ? "Ingresos" : "Revenue"}</p>
            <p className="text-sm font-bold text-slate-900">{money(current.revenue)}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-[11px] font-medium text-slate-500">{lang === "es" ? "Costo de insumos" : "Cost of goods"}</p>
            <p className="text-sm font-bold text-slate-900">− {money(current.cogs)}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-[11px] font-medium text-slate-500">{lang === "es" ? "Gastos fijos" : "Fixed costs"}</p>
            <p className="text-sm font-bold text-slate-900">− {money(current.fixedCostsProrated)}</p>
          </div>
        </div>
        <div className={cn("rounded-md p-3", current.netProfit >= 0 ? "bg-emerald-50" : "bg-red-50")}>
          <p className="text-[11px] font-medium text-slate-500">{lang === "es" ? "Utilidad neta" : "Net profit"}</p>
          <p className={cn("text-xl font-bold", current.netProfit >= 0 ? "text-emerald-700" : "text-red-700")}>{money(current.netProfit)}</p>
        </div>
        {current.coverage.totalActiveItems > 0 && current.coverage.itemsWithSales < current.coverage.totalActiveItems && (
          <p className="text-xs text-amber-600">
            {lang === "es"
              ? `Cálculo parcial: solo ${current.coverage.itemsWithSales} de ${current.coverage.totalActiveItems} productos activos del menú tienen venta registrada en este período.`
              : `Partial calculation: only ${current.coverage.itemsWithSales} of ${current.coverage.totalActiveItems} active menu items have logged sales in this period.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
