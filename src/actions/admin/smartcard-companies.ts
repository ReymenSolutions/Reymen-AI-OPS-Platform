"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import { updateSmartcardCompanyAdmin, type SmartcardCompanyAdminInput } from "@/lib/smartcard-admin";

/**
 * Server Action de Admin → SmartCard → Empresas — mismo patrón
 * { success, error? } que clients/cards/profiles. Solo update: no hay
 * create (ver el comentario de smartcard-admin.ts) ni delete (tampoco existe
 * en admin.reymen.mx — una company no se da de baja desde ahí).
 */

type ActionResult<T = null> = { success: true; data: T } | { success: false; error: string };

export async function updateSmartcardCompanyAction(
  id: string,
  input: SmartcardCompanyAdminInput
): Promise<ActionResult<null>> {
  try {
    const session = await requireAdmin();
    const result = await updateSmartcardCompanyAdmin(id, input);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_company.updated",
      resource: "SmartcardCompany",
      resourceId: id,
      metadata: { name: input.name, slug: input.slug, status: input.status },
    });
    revalidatePath("/admin/smartcard/companies");
    revalidatePath(`/admin/smartcard/companies/${id}`);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-companies/actions] updateSmartcardCompanyAction falló:", err);
    return { success: false, error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }
}
