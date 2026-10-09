import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/guards";
import {
  getSmartcardClient,
  listSmartcardCompanyOptions,
  listClientCards,
  listClientProfiles,
} from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { SmartcardClientForm } from "@/components/admin/SmartcardClientForm";
import { SmartcardClientDangerZone } from "@/components/admin/SmartcardClientDangerZone";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function SmartcardClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  await requireAdmin();
  const { clientId } = await params;

  const [client, companies, profiles, cards] = await Promise.all([
    getSmartcardClient(clientId),
    listSmartcardCompanyOptions(),
    listClientProfiles(clientId),
    listClientCards(clientId),
  ]);

  if (!client) notFound();

  return (
    <div>
      <Link href="/admin/smartcard/clients" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Volver a titulares
      </Link>

      <PageHeader
        title={client.name}
        description={client.deletedAt ? "Este titular está dado de baja." : undefined}
        actions={
          client.deletedAt ? (
            <Badge variant="outline" className="border-slate-300 text-slate-500">
              Dado de baja
            </Badge>
          ) : undefined
        }
      />

      <SmartcardClientForm
        clientId={client.id}
        companies={companies ?? []}
        initial={{
          name: client.name,
          businessName: client.businessName,
          email: client.email,
          phone: client.phone,
          notes: client.notes,
          status: client.status,
          companyId: client.companyId,
        }}
      />

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">Perfiles ({profiles.length})</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/admin/smartcard/profiles/new?clientId=${client.id}`}>+ Nuevo</Link>
            </Button>
          </div>
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              {profiles.length === 0 && <p className="text-sm text-slate-400">Sin perfiles todavía.</p>}
              {profiles.map((p) => (
                <Link
                  key={p.id}
                  href={`/admin/smartcard/profiles/${p.id}`}
                  className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{p.displayName}</span>
                  <span className="text-xs text-slate-400">/{p.slug}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">Tarjetas ({cards.length})</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/admin/smartcard/cards/new?clientId=${client.id}`}>+ Nueva</Link>
            </Button>
          </div>
          <Card>
            <CardContent className="flex flex-col gap-2 p-4">
              {cards.length === 0 && <p className="text-sm text-slate-400">Sin tarjetas todavía.</p>}
              {cards.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/smartcard/cards/${c.id}`}
                  className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{c.cardCode}</span>
                  <span className="text-xs text-slate-400">{c.destinationType}</span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-8">
        <SmartcardClientDangerZone clientId={client.id} deleted={!!client.deletedAt} />
      </div>
    </div>
  );
}
