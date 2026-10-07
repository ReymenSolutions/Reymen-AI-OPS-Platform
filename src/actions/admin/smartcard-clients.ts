"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import {
  createSmartcardClient,
  updateSmartcardClient,
  softDeleteSmartcardClient,
  reactivateSmartcardClient,
  type SmartcardClientInput,
} from "@/lib/smartcard-admin";

/**
 * Server Actions de Admin → SmartCard → Clientes. A diferencia de
 * src/actions/admin/smartcard-link.ts (que lanza UserError y lo captura
 * getErrorMessage en el cliente), estas devuelven un resultado
 * { success, error? } — mismo criterio que src/actions/portal/smartcard.ts,
 * para que el formulario de cliente (compartido conceptualmente entre
 * crear/editar) tenga un solo patrón de manejo de error que seguir.
 *
 * requireAdmin() ya exige sesión con rol admin (isAdmin() en guards.ts) —
 * sin eso no hay forma de llegar aquí ni de ver el botón que dispara esto.
 */

type ActionResult<T = { id: string }> = { success: true; data: T } | { success: false; error: string };

function refresh(clientId?: string) {
  revalidatePath("/admin/smartcard/clients");
  if (clientId) revalidatePath(`/admin/smartcard/clients/${clientId}`);
}

export async function createSmartcardClientAction(input: SmartcardClientInput): Promise<ActionResult> {
  try {
    const session = await requireAdmin();
    const result = await createSmartcardClient(input);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_client.created",
      resource: "SmartcardClient",
      resourceId: result.data.id,
      metadata: { name: input.name, businessName: input.businessName, companyId: input.companyId },
    });
    refresh();
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[smartcard-clients/actions] createSmartcardClientAction falló:", err);
    return { success: false, error: "No se pudo guardar el cliente. Intenta de nuevo." };
  }
}

export async function updateSmartcardClientAction(
  id: string,
  input: SmartcardClientInput
): Promise<ActionResult<null>> {
  try {
    const session = await requireAdmin();
    const result = await updateSmartcardClient(id, input);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_client.updated",
      resource: "SmartcardClient",
      resourceId: id,
      metadata: { name: input.name, businessName: input.businessName, companyId: input.companyId },
    });
    refresh(id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-clients/actions] updateSmartcardClientAction falló:", err);
    return { success: false, error: "No se pudo guardar el cliente. Intenta de nuevo." };
  }
}

export async function softDeleteSmartcardClientAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAdmin();
    // Mismo criterio que admin.reymen.mx (apps/admin/app/clients/[id]/actions.ts
    // softDeleteClientAction): dar de baja un cliente es SUPER_ADMIN solamente,
    // más estricto que crear/editar (cualquier ADMIN).
    if (session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Solo un super admin puede dar de baja un cliente." };
    }
    const result = await softDeleteSmartcardClient(id);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({ userId: session.user.id, action: "smartcard_client.deleted", resource: "SmartcardClient", resourceId: id });
    refresh(id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-clients/actions] softDeleteSmartcardClientAction falló:", err);
    return { success: false, error: "No se pudo dar de baja al cliente. Intenta de nuevo." };
  }
}

export async function reactivateSmartcardClientAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAdmin();
    if (session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Solo un super admin puede reactivar un cliente." };
    }
    const result = await reactivateSmartcardClient(id);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({ userId: session.user.id, action: "smartcard_client.reactivated", resource: "SmartcardClient", resourceId: id });
    refresh(id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-clients/actions] reactivateSmartcardClientAction falló:", err);
    return { success: false, error: "No se pudo reactivar al cliente. Intenta de nuevo." };
  }
}
