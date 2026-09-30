// Leads creados por día en los últimos N días, para la gráfica de tendencia
// de Reportes (portal) y Métricas (admin). Antes cada página tenía su propia
// copia idéntica de esta función.
export function buildLeadTrend(leads: { createdAt: Date }[], days = 30): { date: string; total: number }[] {
  const now = new Date();
  const map = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    map.set(`${d.getMonth() + 1}/${d.getDate()}`, 0);
  }
  for (const lead of leads) {
    const d = new Date(lead.createdAt);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([date, total]) => ({ date, total }));
}
