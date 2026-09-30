// Revisiones de acceso compartidas por las acciones de servidor. Antes cada
// archivo tenía su propia copia (requireAdmin en 2 archivos, la misma
// condición escrita a mano ~20 veces y requireSettingsManage en 4).
import type { UserRole } from "@prisma/client";
import { auth, isAdmin } from "./auth";
import { can, type Action } from "./permissions";

/** Sesión de un admin de la plataforma (ADMIN o SUPER_ADMIN), o lanza "No autorizado". */
export async function requireAdmin() {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");
  return session;
}

/** Sesión de un usuario de una organización con el permiso indicado, o lanza "No autorizado". */
export async function requireOrgPermission(action: Action) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  if (!can(session.user.role as UserRole, action)) throw new Error("No autorizado");
  return session as typeof session & { user: { organizationId: string } };
}
