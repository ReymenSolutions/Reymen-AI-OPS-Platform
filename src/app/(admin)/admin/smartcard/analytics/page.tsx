import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireAdmin } from "@/lib/guards";
import { getSmartcardAnalytics, smartcardEventTypeLabel, smartcardSourceLabel } from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DAY_OPTIONS = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
  { value: "all", label: "Todo" },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Admin → SmartCard → Analítica. Reemplaza admin.reymen.mx/analytics --
 * puramente de lectura, abierta a ADMIN y SUPER_ADMIN por igual (mismo
 * corte que allá: los 3 roles leen events sin distinción).
 */
export default async function SmartcardAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; card_id?: string; days?: string }>;
}) {
  await requireAdmin();
  const { client_id, card_id, days } = await searchParams;
  const daysParam = days ?? "30";

  const data = await getSmartcardAnalytics({ clientId: client_id, cardId: card_id, days: daysParam });

  const rangeQuery = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (client_id) params.set("client_id", client_id);
    if (card_id) params.set("card_id", card_id);
    params.set("days", daysParam);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/admin/smartcard/analytics?${s}` : "/admin/smartcard/analytics";
  };

  return (
    <div>
      <PageHeader
        title="Analítica"
        description="Escaneos y clics registrados en las tarjetas y perfiles de SmartCard. No incluye eventos marcados como bot."
      />

      {data === null ? (
        <EmptyState
          icon={BarChart3}
          title="SmartCard no está configurado en este servidor"
          description="Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env."
        />
      ) : (
        <>
          {(data.filteredClientName || data.filteredCardCode) && (
            <p className="mb-4 text-sm text-slate-500">
              {data.filteredClientName && (
                <>
                  Solo de <strong>{data.filteredClientName}</strong> —{" "}
                  <Link href={rangeQuery({ client_id: undefined })} className="underline">
                    ver todos
                  </Link>
                </>
              )}
              {data.filteredCardCode && (
                <>
                  {" "}
                  Solo de la tarjeta <strong>{data.filteredCardCode}</strong> —{" "}
                  <Link href={rangeQuery({ card_id: undefined })} className="underline">
                    ver todas
                  </Link>
                </>
              )}
            </p>
          )}

          <div className="mb-6 flex flex-wrap items-center gap-4">
            <form method="get" className="flex items-center gap-2">
              {card_id && <input type="hidden" name="card_id" value={card_id} />}
              <input type="hidden" name="days" value={daysParam} />
              <select
                name="client_id"
                defaultValue={client_id ?? ""}
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Todos los titulares</option>
                {data.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline" size="sm">
                Filtrar
              </Button>
            </form>

            <div className="flex items-center gap-1 text-sm">
              {DAY_OPTIONS.map((opt) => (
                <Link
                  key={opt.value}
                  href={rangeQuery({ days: opt.value })}
                  className={`rounded-md px-3 py-1.5 ${
                    daysParam === opt.value
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {opt.label}
                </Link>
              ))}
            </div>
          </div>

          {data.totalEvents === 0 ? (
            <EmptyState icon={BarChart3} title="Sin eventos en este rango todavía." />
          ) : (
            <>
              <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-2xl font-semibold text-slate-900">{data.totalEvents}</p>
                  <p className="text-sm text-slate-500">Eventos totales</p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-2xl font-semibold text-slate-900">{data.totalScans}</p>
                  <p className="text-sm text-slate-500">
                    Escaneos ({data.nfcScans} NFC · {data.qrScans} QR)
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-2xl font-semibold text-slate-900">{data.clickCount}</p>
                  <p className="text-sm text-slate-500">Clics de contacto/enlaces</p>
                </div>
                <div className="rounded-md border border-slate-200 p-4">
                  <p className="text-2xl font-semibold text-slate-900">{data.saveContactCount}</p>
                  <p className="text-sm text-slate-500">Contactos guardados</p>
                </div>
              </section>

              <div className="mb-8 grid gap-6 sm:grid-cols-2">
                <section>
                  <h2 className="mb-2 text-sm font-semibold text-slate-500">Por tipo de evento</h2>
                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                    {data.byType.map(({ type, count }) => (
                      <li key={type} className="flex items-center justify-between px-3 py-2">
                        <span>{smartcardEventTypeLabel(type)}</span>
                        <span className="font-medium text-slate-900">{count}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h2 className="mb-2 text-sm font-semibold text-slate-500">Por origen y dispositivo</h2>
                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                    {data.bySource.map(({ source, count }) => (
                      <li key={source} className="flex items-center justify-between px-3 py-2">
                        <span>{smartcardSourceLabel(source)}</span>
                        <span className="font-medium text-slate-900">{count}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                    {data.byDevice.map(({ device, count }) => (
                      <li key={device} className="flex items-center justify-between px-3 py-2">
                        <span className="capitalize">{device}</span>
                        <span className="font-medium text-slate-900">{count}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              {data.topCards.length > 0 && (
                <section className="mb-8">
                  <h2 className="mb-2 text-sm font-semibold text-slate-500">Tarjetas con más actividad</h2>
                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                    {data.topCards.map((c) => (
                      <li key={c.id} className="flex items-center justify-between px-3 py-2">
                        <span>
                          {c.cardCode ? (
                            <Link href={`/admin/smartcard/cards/${c.id}`} className="font-medium hover:underline">
                              {c.cardCode}
                            </Link>
                          ) : (
                            <span className="text-slate-400">(tarjeta eliminada)</span>
                          )}
                          {c.clientName && <span className="ml-2 text-slate-400">{c.clientName}</span>}
                        </span>
                        <span className="font-medium text-slate-900">{c.count}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.topProfiles.length > 0 && (
                <section className="mb-8">
                  <h2 className="mb-2 text-sm font-semibold text-slate-500">Perfiles con más vistas</h2>
                  <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 text-sm">
                    {data.topProfiles.map((p) => (
                      <li key={p.id} className="flex items-center justify-between px-3 py-2">
                        <span>
                          {p.displayName ? (
                            <Link href={`/admin/smartcard/profiles/${p.id}`} className="font-medium hover:underline">
                              {p.displayName}
                            </Link>
                          ) : (
                            <span className="text-slate-400">(perfil eliminado)</span>
                          )}
                        </span>
                        <span className="font-medium text-slate-900">{p.count}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h2 className="mb-2 text-sm font-semibold text-slate-500">Eventos más recientes (máx. 25)</h2>
                <Card>
                  <CardContent className="overflow-x-auto p-0">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Fecha</th>
                          <th className="px-3 py-2 font-medium">Evento</th>
                          <th className="px-3 py-2 font-medium">Origen</th>
                          <th className="px-3 py-2 font-medium">Tarjeta / perfil</th>
                          <th className="px-3 py-2 font-medium">Dispositivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.recentEvents.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50">
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtDate(e.occurredAt)}</td>
                            <td className="px-3 py-2">{smartcardEventTypeLabel(e.eventType)}</td>
                            <td className="px-3 py-2 text-slate-600">{smartcardSourceLabel(e.source)}</td>
                            <td className="px-3 py-2 text-slate-600">
                              {e.cardId && e.cardCode ? (
                                <Link href={`/admin/smartcard/cards/${e.cardId}`} className="hover:underline">
                                  {e.cardCode}
                                </Link>
                              ) : e.profileId && e.profileDisplayName ? (
                                <Link href={`/admin/smartcard/profiles/${e.profileId}`} className="hover:underline">
                                  {e.profileDisplayName}
                                </Link>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-600 capitalize">{e.deviceType ?? "unknown"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
