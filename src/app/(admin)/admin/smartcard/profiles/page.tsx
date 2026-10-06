import Link from "next/link";
import { IdCard, Plus } from "lucide-react";
import { requireAdmin } from "@/lib/guards";
import { listSmartcardProfiles, getSmartcardClient } from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function SmartcardProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; clientId?: string }>;
}) {
  await requireAdmin();
  const { q, clientId } = await searchParams;

  const [profiles, filteredClient] = await Promise.all([
    listSmartcardProfiles({ search: q, clientId }),
    clientId ? getSmartcardClient(clientId) : Promise.resolve(null),
  ]);

  const newHref = clientId ? `/admin/smartcard/profiles/new?clientId=${clientId}` : "/admin/smartcard/profiles/new";

  return (
    <div>
      <PageHeader
        title="Perfiles digitales"
        description={
          filteredClient
            ? `Solo de ${filteredClient.name} — `
            : "Los perfiles públicos (link.reymensolutions.mx/[slug]) de cada cliente."
        }
        actions={
          <Button asChild>
            <Link href={newHref}>
              <Plus className="h-4 w-4" />
              Nuevo perfil
            </Link>
          </Button>
        }
      />

      {filteredClient && (
        <p className="mb-4 -mt-2 text-sm text-slate-500">
          Mostrando solo <strong>{filteredClient.name}</strong> —{" "}
          <Link href="/admin/smartcard/profiles" className="text-brand-600 hover:underline">
            ver todos
          </Link>
        </p>
      )}

      <form method="get" className="mb-6 flex gap-2">
        {clientId && <input type="hidden" name="clientId" value={clientId} />}
        <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por nombre, slug o negocio..." className="max-w-sm" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
        {q && (
          <Button asChild variant="ghost">
            <Link href={clientId ? `/admin/smartcard/profiles?clientId=${clientId}` : "/admin/smartcard/profiles"}>Limpiar</Link>
          </Button>
        )}
      </form>

      {profiles === null ? (
        <EmptyState
          icon={IdCard}
          title="SmartCard no está configurado en este servidor"
          description="Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env."
        />
      ) : profiles.length === 0 ? (
        <EmptyState
          icon={IdCard}
          title={q ? `Sin resultados para "${q}"` : "No hay perfiles todavía"}
          action={
            !q ? (
              <Button asChild>
                <Link href={newHref}>Da de alta el primero</Link>
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
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/smartcard/profiles/${p.id}`} className="font-medium text-slate-900 hover:underline">
                        {p.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500">/{p.slug}</td>
                    <td className="px-4 py-3 text-slate-600">{p.clientName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={p.status === "ACTIVE" ? "default" : "outline"}>{p.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge>
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
