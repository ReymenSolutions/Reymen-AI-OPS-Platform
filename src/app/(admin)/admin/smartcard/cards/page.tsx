import Link from "next/link";
import { CreditCard, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/guards";
import { listSmartcardCards, getSmartcardClient } from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function SmartcardCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; clientId?: string }>;
}) {
  await requireAdmin();
  const { q, clientId } = await searchParams;

  const [cards, filteredClient] = await Promise.all([
    listSmartcardCards({ search: q, clientId }),
    clientId ? getSmartcardClient(clientId) : Promise.resolve(null),
  ]);

  const newHref = clientId ? `/admin/smartcard/cards/new?clientId=${clientId}` : "/admin/smartcard/cards/new";

  return (
    <div>
      <PageHeader
        title="Tarjetas"
        description={
          filteredClient
            ? `Solo de ${filteredClient.name} — `
            : "Todas las tarjetas SmartCard (REY-000001, etc.) y a qué redirigen."
        }
        actions={
          <Button asChild>
            <Link href={newHref}>
              <Plus className="h-4 w-4" />
              Nueva tarjeta
            </Link>
          </Button>
        }
      />

      {filteredClient && (
        <p className="mb-4 -mt-2 text-sm text-slate-500">
          Mostrando solo <strong>{filteredClient.name}</strong> —{" "}
          <Link href="/admin/smartcard/cards" className="text-brand-600 hover:underline">
            ver todas
          </Link>
        </p>
      )}

      <form method="get" className="mb-6 flex gap-2">
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por código (REY-000001)..." className="max-w-sm" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
        {q && (
          <Button asChild variant="ghost">
            <Link href={clientId ? `/admin/smartcard/cards?clientId=${clientId}` : "/admin/smartcard/cards"}>Limpiar</Link>
          </Button>
        )}
      </form>

      {cards === null ? (
        <EmptyState
          icon={CreditCard}
          title="SmartCard no está configurado en este servidor"
          description="Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env."
        />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={q ? `Sin resultados para "${q}"` : "No hay tarjetas todavía"}
          action={
            !q ? (
              <Button asChild>
                <Link href={newHref}>Da de alta la primera</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Código</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Destino</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cards.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/smartcard/cards/${c.id}`} className="font-medium text-slate-900 hover:underline">
                        {c.cardCode ?? "(sin código)"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.clientName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{c.destinationType}</td>
                    <td className="px-4 py-3">
                      <Badge variant={c.status === "ACTIVE" ? "default" : "outline"}>
                        {c.status === "ACTIVE" ? "Activa" : "Inactiva"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
