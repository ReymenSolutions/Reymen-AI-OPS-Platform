"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import {
  createSmartcardAdminProfile,
  updateSmartcardAdminProfile,
  softDeleteSmartcardAdminProfile,
  reactivateSmartcardAdminProfile,
  addSmartcardAdminProfileLink,
  deleteSmartcardAdminProfileLink,
  toggleSmartcardAdminProfileLink,
  moveSmartcardAdminProfileLink,
  updateSmartcardAdminProfileLinkIcon,
  type SmartcardAdminProfileInput,
} from "@/lib/smartcard-admin";

/**
 * Server Actions de Admin → SmartCard → Perfiles — mismo patrón { success,
 * error? } que smartcard-clients.ts/smartcard-cards.ts. Los links de perfil
 * no se auditan uno por uno a propósito (ver el comentario de
 * smartcard-admin.ts) — solo crear/editar/dar de baja/reactivar el perfil.
 */

type ActionResult<T = { id: string }> = { success: true; data: T } | { success: false; error: string };

function refresh(profileId?: string) {
  revalidatePath("/admin/smartcard/profiles");
  if (profileId) revalidatePath(`/admin/smartcard/profiles/${profileId}`);
}

export async function createSmartcardProfileAction(
  clientId: string,
  input: SmartcardAdminProfileInput
): Promise<ActionResult> {
  try {
    const session = await requireAdmin();
    const result = await createSmartcardAdminProfile(clientId, input);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_profile.created",
      resource: "SmartcardProfile",
      resourceId: result.data.id,
      metadata: { clientId, slug: input.slug, displayName: input.displayName },
    });
    refresh();
    revalidatePath(`/admin/smartcard/clients/${clientId}`);
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[smartcard-profiles/actions] createSmartcardProfileAction falló:", err);
    return { success: false, error: "No se pudo guardar el perfil. Intenta de nuevo." };
  }
}

export async function updateSmartcardProfileAction(
  id: string,
  input: SmartcardAdminProfileInput
): Promise<ActionResult<null>> {
  try {
    const session = await requireAdmin();
    const result = await updateSmartcardAdminProfile(id, input);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_profile.updated",
      resource: "SmartcardProfile",
      resourceId: id,
      metadata: { slug: input.slug, displayName: input.displayName, status: input.status },
    });
    refresh(id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-profiles/actions] updateSmartcardProfileAction falló:", err);
    return { success: false, error: "No se pudo guardar el perfil. Intenta de nuevo." };
  }
}

export async function softDeleteSmartcardProfileAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAdmin();
    if (session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Solo un super admin puede dar de baja un perfil." };
    }
    const result = await softDeleteSmartcardAdminProfile(id);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({ userId: session.user.id, action: "smartcard_profile.deleted", resource: "SmartcardProfile", resourceId: id });
    refresh(id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-profiles/actions] softDeleteSmartcardProfileAction falló:", err);
    return { success: false, error: "No se pudo dar de baja el perfil. Intenta de nuevo." };
  }
}

export async function reactivateSmartcardProfileAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAdmin();
    if (session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Solo un super admin puede reactivar un perfil." };
    }
    const result = await reactivateSmartcardAdminProfile(id);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({ userId: session.user.id, action: "smartcard_profile.reactivated", resource: "SmartcardProfile", resourceId: id });
    refresh(id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-profiles/actions] reactivateSmartcardProfileAction falló:", err);
    return { success: false, error: "No se pudo reactivar el perfil. Intenta de nuevo." };
  }
}

export async function addSmartcardProfileLinkAction(
  profileId: string,
  input: { title: string; url: string; icon: string | null }
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const result = await addSmartcardAdminProfileLink(profileId, input);
    if (!result.ok) return { success: false, error: result.error };
    refresh(profileId);
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[smartcard-profiles/actions] addSmartcardProfileLinkAction falló:", err);
    return { success: false, error: "No se pudo guardar el link. Intenta de nuevo." };
  }
}

export async function deleteSmartcardProfileLinkAction(profileId: string, linkId: string): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    const result = await deleteSmartcardAdminProfileLink(linkId);
    if (!result.ok) return { success: false, error: result.error };
    refresh(profileId);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-profiles/actions] deleteSmartcardProfileLinkAction falló:", err);
    return { success: false, error: "No se pudo eliminar el link. Intenta de nuevo." };
  }
}

export async function toggleSmartcardProfileLinkAction(
  profileId: string,
  linkId: string,
  nextActive: boolean
): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    const result = await toggleSmartcardAdminProfileLink(linkId, nextActive);
    if (!result.ok) return { success: false, error: result.error };
    refresh(profileId);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-profiles/actions] toggleSmartcardProfileLinkAction falló:", err);
    return { success: false, error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }
}

export async function moveSmartcardProfileLinkAction(
  profileId: string,
  linkId: string,
  direction: "up" | "down"
): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    const result = await moveSmartcardAdminProfileLink(profileId, linkId, direction);
    if (!result.ok) return { success: false, error: result.error };
    refresh(profileId);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-profiles/actions] moveSmartcardProfileLinkAction falló:", err);
    return { success: false, error: "No se pudo reordenar. Intenta de nuevo." };
  }
}

export async function updateSmartcardProfileLinkIconAction(
  profileId: string,
  linkId: string,
  icon: string | null
): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    const result = await updateSmartcardAdminProfileLinkIcon(linkId, icon);
    if (!result.ok) return { success: false, error: result.error };
    refresh(profileId);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-profiles/actions] updateSmartcardProfileLinkIconAction falló:", err);
    return { success: false, error: "No se pudo guardar el cambio. Intenta de nuevo." };
  }
}
