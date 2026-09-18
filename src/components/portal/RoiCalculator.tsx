import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import type { RoiData } from "@/lib/roi";

interface RoiCalculatorProps {
  data: RoiData;
  planLabel: string;
}

export function RoiCalculator({ data, planLabel }: RoiCalculatorProps) {
  if (!data.hasWonDeals) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            ROI real
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 text-center py-6">
            Aún no tienes oportunidades ganadas con valor registrado. Registra el valor de tus oportunidades en el{" "}
            <Link href="/portal/pipeline" className="text-brand-600 hover:underline font-medium">
              Pipeline
            </Link>{" "}
            para ver tu ROI real aquí.
          </p>
        </CardContent>
      </Card>
    );
  }

  const roiPositive = (data.roi ?? 0) > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          ROI real
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Oportunidades ganadas (30 días)", value: data.last30WonOpportunities.toLocaleString("en-US"), color: "text-slate-900" },
            { label: "Ingresos reales (30 días)", value: `$${data.last30Revenue.toLocaleString("en-US")}`, color: "text-emerald-600" },
            { label: "Valor promedio por deal", value: `$${Math.round(data.avgDealValue).toLocaleString("en-US")}`, color: "text-brand-600" },
            { label: "ROI real (30 días)", value: data.roi !== null ? `${data.roi}%` : "—", color: roiPositive ? "text-emerald-600" : "text-red-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
              <p className={`text-xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="info-box mt-4 rounded-lg border border-brand-100 bg-brand-50 p-3">
          <p className="info-box-title text-sm font-medium text-brand-900">
            Ingresos últimos 30 días:{" "}
            <span className="info-box-text text-brand-700">${data.last30Revenue.toLocaleString("en-US")} USD</span>
            {" "}vs. tu plan {planLabel}:{" "}
            <span className="info-box-text text-brand-700">${data.planCost}/mes</span>
          </p>
          <p className="info-box-text text-xs text-brand-700 mt-0.5">
            Basado en {data.last30WonOpportunities} oportunidad{data.last30WonOpportunities === 1 ? "" : "es"} ganada
            {data.last30WonOpportunities === 1 ? "" : "s"} en tu pipeline durante los últimos 30 días. Histórico total:{" "}
            {data.totalWonOpportunities} oportunidades ganadas por ${data.totalRevenue.toLocaleString("en-US")} USD.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
