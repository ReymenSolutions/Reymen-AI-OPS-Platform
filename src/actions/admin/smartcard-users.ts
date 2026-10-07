"use server";

import { revalidatePath } from "next/cache";
import { auth, isAdmin } from "@/lib/auth";
import { UserError } from "@/lib/user-error";
import { logAudit } from "@/lib/audit";
import {
  inviteSmartcardAdminUser,
  updateSmartcardAdminUser,
  deactivateSmartcardAdminUser,
  reactivateSmartcardAdminUser,
  type SmartcardAdminUserInput,
  type SmartcardAdminRole,
} from "@/lib/smartcard-admin";

/**
 * Server Actions de Admin → SmartCard → Usuarios (Fase 4: staff de
 * admin.reymen.mx, tabla admin_profiles). Mismo patrón { success, error? }
 * que el resto del panel. A diferencia de clientes/tarjetas/perfiles y de
 * los catálogos (donde ver es ADMIN+SUPER_ADMIN y solo escribir exige
 * SUPER_ADMIN), aquí incluso VER la lista de cuentas exige SUPER_ADMIN --
 * mismo corte que la propia pantalla /users de admin.reymen.mx, que no deja
 * entrar a un ADMIN ni en modo lectura.
 */

type ActionResult<T = { id: string }> = { success: true; data: T } | { success: false; error: string };

async function requireSmartcardUsersSuperAdmin() {
  const session = await auth();
  if (!session || !isAdmin(session.user.role) || session.user.role !== "SUPER_ADMIN") {
    throw new UserError("Solo un super admin puede ver y gestionar usuarios de SmartCard.");
  }
  return session;
}

function refreshUsers(id?: string) {
  revalidatePath("/admin/smartcard/users");
  if (id) revalidatePath(`/admin/smartcard/users/${id}`);
}

export async function inviteSmartcardAdminUserAction(input: SmartcardAdminUserInput): Promise<ActionResult> {
  try {
    const session = await requireSmartcardUsersSuperAdmin();
    const result = await inviteSmartcardAdminUser(input);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_admin_user.invited",
      resource: "SmartcardAdminUser",
      resourceId: result.data.id,
      metadata: { email: input.email, fullName: input.fullName, role: input.role },
    });
    refreshUsers();
    return { success: true, data: result.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo enviar la invitación. Intenta de nuevo.";
    return { success: false, error: message };
  }
}

export async function updateSmartcardAdminUserAction(
  id: string,
  input: { fullName: string; role: SmartcardAdminRole }
): Promise<ActionResult<null>> {
  try {
    const session = await requireSmartcardUsersSuperAdmin();
    const result = await updateSmartcardAdminUser(id, input);
    if (!result.ok) return { success: false, error: result.error };

    // Mismo matiz que card.destination_changed o theme/destination_type en
    // las fases anteriores: cambiar el rol de un admin es más significativo
    // que solo cambiarle el nombre, así que queda como su propia acción.
    await logAudit({
      userId: session.user.id,
      action: result.data.roleChanged ? "smartcard_admin_user.role_changed" : "smartcard_admin_user.updated",
      resource: "SmartcardAdminUser",
      resourceId: id,
      metadata: { fullName: input.fullName, role: input.role },
    });
    refreshUsers(id);
    return { success: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el cambio. Intenta de nuevo.";
    return { success: false, error: message };
  }
}

export async function deactivateSmartcardAdminUserAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireSmartcardUsersSuperAdmin();
    const result = await deactivateSmartcardAdminUser(id);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_admin_user.deactivated",
      resource: "SmartcardAdminUser",
      resourceId: id,
    });
    refreshUsers(id);
    return { success: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el cambio. Intenta de nuevo.";
    return { success: false, error: message };
  }
}

export async function reactivateSmartcardAdminUserAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireSmartcardUsersSuperAdmin();
    const result = await reactivateSmartcardAdminUser(id);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_admin_user.reactivated",
      resource: "SmartcardAdminUser",
      resourceId: id,
    });
    refreshUsers(id);
    return { success: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el cambio. Intenta de nuevo.";
    return { success: false, error: message };
  }
}
