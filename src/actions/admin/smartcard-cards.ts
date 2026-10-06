"use server";

import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import { buildSmartcardPublicUrl } from "@/lib/smartcard-company";
import { getSmartcardAdminClient } from "@/lib/smartcard-supabase";
import {
  createSmartcardCard,
  updateSmartcardCard,
  softDeleteSmartcardCard,
  reactivateSmartcardCard,
  type SmartcardCardInput,
} from "@/lib/smartcard-admin";

/**
 * Server Actions de Admin → SmartCard → Tarjetas — mismo patrón que
 * smartcard-clients.ts ({ success, error? } en vez de throw+UserError, ver
 * el comentario de ese archivo).
 */

type ActionResult<T = { id: string }> = { success: true; data: T } | { success: false; error: string };

function refresh(clientId?: string, cardId?: string) {
  revalidatePath("/admin/smartcard/cards");
  if (clientId) revalidatePath(`/admin/smartcard/clients/${clientId}`);
  if (cardId) revalidatePath(`/admin/smartcard/cards/${cardId}`);
}

export async function createSmartcardCardAction(input: SmartcardCardInput): Promise<ActionResult> {
  try {
    const session = await requireAdmin();
    const result = await createSmartcardCard(input);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_card.created",
      resource: "SmartcardCard",
      resourceId: result.data.id,
      metadata: { clientId: input.clientId, destinationType: input.destinationType },
    });
    refresh(input.clientId);
    return { success: true, data: result.data };
  } catch (err) {
    console.error("[smartcard-cards/actions] createSmartcardCardAction falló:", err);
    return { success: false, error: "No se pudo guardar la tarjeta. Intenta de nuevo." };
  }
}

export async function updateSmartcardCardAction(id: string, input: SmartcardCardInput): Promise<ActionResult<null>> {
  try {
    const session = await requireAdmin();
    const result = await updateSmartcardCard(id, input);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: result.data.destinationChanged ? "smartcard_card.destination_changed" : "smartcard_card.updated",
      resource: "SmartcardCard",
      resourceId: id,
      metadata: {
        clientId: input.clientId,
        destinationType: input.destinationType,
        profileId: input.profileId,
        destinationUrl: input.destinationUrl,
      },
    });
    refresh(input.clientId, id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-cards/actions] updateSmartcardCardAction falló:", err);
    return { success: false, error: "No se pudo guardar la tarjeta. Intenta de nuevo." };
  }
}

export async function softDeleteSmartcardCardAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAdmin();
    if (session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Solo un super admin puede dar de baja una tarjeta." };
    }
    const result = await softDeleteSmartcardCard(id);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({ userId: session.user.id, action: "smartcard_card.deleted", resource: "SmartcardCard", resourceId: id });
    refresh(undefined, id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-cards/actions] softDeleteSmartcardCardAction falló:", err);
    return { success: false, error: "No se pudo dar de baja la tarjeta. Intenta de nuevo." };
  }
}

export async function reactivateSmartcardCardAction(id: string): Promise<ActionResult<null>> {
  try {
    const session = await requireAdmin();
    if (session.user.role !== "SUPER_ADMIN") {
      return { success: false, error: "Solo un super admin puede reactivar una tarjeta." };
    }
    const result = await reactivateSmartcardCard(id);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({ userId: session.user.id, action: "smartcard_card.reactivated", resource: "SmartcardCard", resourceId: id });
    refresh(undefined, id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[smartcard-cards/actions] reactivateSmartcardCardAction falló:", err);
    return { success: false, error: "No se pudo reactivar la tarjeta. Intenta de nuevo." };
  }
}

export type SmartcardCardQrResult = { success: true; dataUrl: string; url: string } | { success: false; error: string };

/**
 * Genera el QR (PNG data URL) de una tarjeta para descarga desde el panel de
 * admin — mismo mecanismo que getSmartcardCardQrCode en
 * actions/portal/smartcard.ts, pero sin acotar por company (cross-tenant,
 * cualquier admin puede ver el QR de cualquier tarjeta).
 */
export async function getSmartcardAdminCardQrCodeAction(cardId: string): Promise<SmartcardCardQrResult> {
  try {
    await requireAdmin();
    const supabase = getSmartcardAdminClient();
    if (!supabase) return { success: false, error: "SmartCard aún no está configurado en este entorno." };

    const { data: card, error } = await supabase.from("cards").select("card_code").eq("id", cardId).maybeSingle();
    if (error) {
      console.error("[smartcard-cards/actions] Error buscando card para QR:", error.message);
      return { success: false, error: "No se pudo cargar la tarjeta. Intenta de nuevo." };
    }
    if (!card?.card_code) return { success: false, error: "Esta tarjeta todavía no tiene un código asignado." };

    const url = buildSmartcardPublicUrl(card.card_code as string);
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 512 });
    return { success: true, dataUrl, url };
  } catch (err) {
    console.error("[smartcard-cards/actions] getSmartcardAdminCardQrCodeAction falló:", err);
    return { success: false, error: "No se pudo generar el QR. Intenta de nuevo." };
  }
}
