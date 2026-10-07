"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import {
  createSmartcardTheme,
  updateSmartcardTheme,
  createSmartcardDestinationType,
  updateSmartcardDestinationTypeLabel,
  toggleSmartcardDestinationType,
  addSmartcardReservedSlug,
  deleteSmartcardReservedSlug,
  type SmartcardThemeInput,
} from "@/lib/smartcard-admin";

/**
 * Server Actions de Admin → SmartCard → Ajustes (Fase 3: temas, tipos de
 * destino, slugs reservados). Mismo patrón { success, error? } que el resto
 * del panel. Todas exigen SUPER_ADMIN para escribir — mismo corte que
 * admin.reymen.mx's /settings (visible a ADMIN+SUPERADMIN vía requireAdmin
 * en las páginas, pero cada escritura ahí ya exigía SUPERADMIN).
 */

type ActionResult<T = { id: string }> = { success: true; data: T } | { success: false; error: string };

async function requireSuperAdmin() {
  const session = await requireAdmin();
  if (session.user.role !== "SUPER_ADMIN") {
    throw new Error("Solo un super admin puede modificar estos catálogos.");
  }
  return session;
}

function refreshSettings() {
  revalidatePath("/admin/smartcard/settings");
}

export async function createSmartcardThemeAction(input: SmartcardThemeInput): Promise<ActionResult> {
  try {
    const session = await requireSuperAdmin();
    const result = await createSmartcardTheme(input);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_theme.created",
      resource: "SmartcardTheme",
      resourceId: result.data.id,
      metadata: { name: input.name, slug: input.slug },
    });
    refreshSettings();
    return { success: true, data: result.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el tema. Intenta de nuevo.";
    return { success: false, error: message };
  }
}

export async function updateSmartcardThemeAction(
  id: string,
  input: SmartcardThemeInput & { isActive: boolean }
): Promise<ActionResult<null>> {
  try {
    const session = await requireSuperAdmin();
    const result = await updateSmartcardTheme(id, input);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_theme.updated",
      resource: "SmartcardTheme",
      resourceId: id,
      metadata: { name: input.name, slug: input.slug, isActive: input.isActive },
    });
    refreshSettings();
    revalidatePath(`/admin/smartcard/settings/themes/${id}`);
    return { success: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el tema. Intenta de nuevo.";
    return { success: false, error: message };
  }
}

export async function createSmartcardDestinationTypeAction(input: {
  code: string;
  label: string;
  requiresProfile: boolean;
  requiresUrl: boolean;
  sortOrder: number;
}): Promise<ActionResult<null>> {
  try {
    const session = await requireSuperAdmin();
    const result = await createSmartcardDestinationType(input);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_destination_type.created",
      resource: "SmartcardDestinationType",
      resourceId: input.code,
      metadata: input,
    });
    refreshSettings();
    return { success: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el cambio. Intenta de nuevo.";
    return { success: false, error: message };
  }
}

export async function updateSmartcardDestinationTypeLabelAction(code: string, label: string): Promise<ActionResult<null>> {
  try {
    await requireSuperAdmin();
    const result = await updateSmartcardDestinationTypeLabel(code, label);
    if (!result.ok) return { success: false, error: result.error };
    refreshSettings();
    return { success: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el cambio. Intenta de nuevo.";
    return { success: false, error: message };
  }
}

export async function toggleSmartcardDestinationTypeAction(code: string, nextActive: boolean): Promise<ActionResult<null>> {
  try {
    const session = await requireSuperAdmin();
    const result = await toggleSmartcardDestinationType(code, nextActive);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: nextActive ? "smartcard_destination_type.reactivated" : "smartcard_destination_type.deactivated",
      resource: "SmartcardDestinationType",
      resourceId: code,
    });
    refreshSettings();
    return { success: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el cambio. Intenta de nuevo.";
    return { success: false, error: message };
  }
}

export async function addSmartcardReservedSlugAction(slug: string): Promise<ActionResult<null>> {
  try {
    await requireSuperAdmin();
    const result = await addSmartcardReservedSlug(slug);
    if (!result.ok) return { success: false, error: result.error };
    refreshSettings();
    return { success: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el cambio. Intenta de nuevo.";
    return { success: false, error: message };
  }
}

export async function deleteSmartcardReservedSlugAction(slug: string): Promise<ActionResult<null>> {
  try {
    await requireSuperAdmin();
    const result = await deleteSmartcardReservedSlug(slug);
    if (!result.ok) return { success: false, error: result.error };
    refreshSettings();
    return { success: true, data: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar el cambio. Intenta de nuevo.";
    return { success: false, error: message };
  }
}
