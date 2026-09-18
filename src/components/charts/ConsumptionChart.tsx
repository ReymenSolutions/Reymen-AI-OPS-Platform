"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { usePreferences } from "@/context/preferences";

export interface ConsumptionDataPoint {
  period: string;
  leads: number;
  messages: number;
  automations: number;
}

interface ConsumptionChartProps {
  data: ConsumptionDataPoint[];
}

export function ConsumptionChart({ data }: ConsumptionChartProps) {
  const { lang } = usePreferences();
  const hasAnyValue = data.some((d) => d.leads > 0 || d.messages > 0 || d.automations > 0);
  if (!hasAnyValue) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-slate-400">{lang === "es" ? "Sin consumo registrado en los últimos meses" : "No usage recorded in the last few months"}</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ color: "#475569" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="leads" name="Leads" stroke="#6366f1" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="messages" name={lang === "es" ? "Mensajes" : "Messages"} stroke="#10b981" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="automations" name={lang === "es" ? "Ejecuciones de automatización" : "Automation runs"} stroke="#f59e0b" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
