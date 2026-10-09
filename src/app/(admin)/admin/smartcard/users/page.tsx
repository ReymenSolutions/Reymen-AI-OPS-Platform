import Link from "next/link";
import { UserCog } from "lucide-react";
import { auth, isAdmin } from "@/lib/auth";
import { listSmartcardAdminUsers } from "@/lib/smartcard-admin";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ROLE_BADGE_CLASS: Record<string, string> = {
  SUPERADMIN: "border-purple-300 text-purple-700",
  ADMIN: "border-blue-300 text-blue-700",
  VIEWER: "border-slate-300 text-slate-500",
};

/**
 * Admin → SmartCard → Usuarios. Reemplaza admin.reymen.mx/users -- staff con
 * acceso a ese panel (tabla admin_profiles). A diferencia del resto de
 * SmartCard en este app, ni siquiera ver esta lista está abierto a un ADMIN:
 * igual que en el origen, se exige SUPER_ADMIN para entrar aquí.
 */
export default async function SmartcardUsersPage() {
  const session = await auth();
  if (!session || !isAdmin(session.user.role) || session.user.role !== "SUPER_ADMIN") {
    return (
      <div>
        <PageHeader title="Administradores" />
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Solo un super admin puede ver la gestión de usuarios administrativos de SmartCard.
        </p>
      </div>
    );
  }

  const users = await listSmartcardAdminUsers();

  return (
    <div>
      <PageHeader
        title="Administradores"
        description="Staff con acceso al panel de SmartCard (admin.reymen.mx) — invitaciones, roles y accesos."
        actions={
          <Button asChild>
            <Link href="/admin/smartcard/users/new">+ Invitar administrador</Link>
          </Button>
        }
      />

      {users === null && (
        <EmptyState
          icon={UserCog}
          title="SmartCard no está configurado en este servidor"
          description="Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env."
        />
      )}

      {users?.length === 0 && <EmptyState icon={UserCog} title="Todavía no hay usuarios administrativos." />}

      {users && users.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Correo</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/smartcard/users/${u.id}`} className="font-medium text-slate-900 hover:underline">
                        {u.fullName}
                      </Link>
                      {u.email?.toLowerCase() === session.user.email?.toLowerCase() && (
                        <span className="ml-2 text-xs text-slate-400">(tú)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{u.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={ROLE_BADGE_CLASS[u.role]}>
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.isActive ? "default" : "outline"}>{u.isActive ? "Activo" : "Desactivado"}</Badge>
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
