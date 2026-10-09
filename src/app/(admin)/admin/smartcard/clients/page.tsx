import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { requireAdmin } from "@/lib/guards";
import { listSmartcardClients } from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Admin → SmartCard → Clientes. Reemplaza admin.reymen.mx/clients — mismo
 * dato (tabla `clients` de reymen-smartcard), ahora administrado desde aquí
 * para que REYMEN ya no necesite entrar a ese otro panel en el día a día
 * (2026-10-06, pedido explícito). Ver smartcard-admin.ts para el porqué de
 * companyId como puente opcional hacia la capa multi-tenant.
 */
export default async function SmartcardClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  const clients = await listSmartcardClients(q);

  return (
    <div>
      <PageHeader
        title="Titulares"
        description="El negocio o la persona a nombre de quien están las tarjetas y perfiles digitales. No son los clientes de Reymen: esos viven en Admin → Clientes."
        actions={
          <Button asChild>
            <Link href="/admin/smartcard/clients/new">
              <Plus className="h-4 w-4" />
              Nuevo titular
            </Link>
          </Button>
        }
      />

      <form method="get" className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por nombre, negocio o correo..." className="max-w-sm" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
        {q && (
          <Button asChild variant="ghost">
            <Link href="/admin/smartcard/clients">Limpiar</Link>
          </Button>
        )}
      </form>

      {clients === null && (
        <EmptyState
          icon={Users}
          title="SmartCard no está configurado en este servidor"
          description="Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env."
        />
      )}

      {clients?.length === 0 && (
        <EmptyState
          icon={Users}
          title={q ? `Sin resultados para "${q}".` : "Todavía no hay titulares."}
          description={q ? undefined : "Da de alta el primero para empezar a emitir tarjetas."}
          action={
            !q ? (
              <Button asChild size="sm">
                <Link href="/admin/smartcard/clients/new">Nuevo titular</Link>
              </Button>
            ) : undefined
          }
        />
      )}

      {clients && clients.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Negocio</th>
                  <th className="px-4 py-3 font-medium">Contacto</th>
                  <th className="px-4 py-3 font-medium">Empresa (multi-tenant)</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/smartcard/clients/${c.id}`} className="font-medium text-slate-900 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.businessName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{c.email ?? c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {c.companyName ?? <span className="text-slate-400">Sin ligar</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          c.status === "ACTIVE" ? "border-green-300 text-green-700" : "border-slate-300 text-slate-500"
                        }
                      >
                        {c.status === "ACTIVE" ? "Activo" : "Inactivo"}
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
