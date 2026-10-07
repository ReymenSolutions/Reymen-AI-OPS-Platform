"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/guards";
import { logAudit } from "@/lib/audit";
import { submitSmartcardFeedback } from "@/lib/smartcard-admin";

/**
 * Server Action de Admin → SmartCard → Feedback (Fase 4). Mismo acceso que
 * la lectura (ADMIN o SUPER_ADMIN, sin distinción) -- igual que en
 * admin.reymen.mx, reportar un problema no está restringido a SUPERADMIN.
 *
 * submit_feedback() deja admin_id en null al llamarse desde aquí (ver nota
 * en smartcard-admin.ts), así que quien reportó queda registrado en la
 * bitácora de auditoría de este panel en vez de en la fila de feedback.
 */

export type SmartcardFeedbackActionResult = { success: true } | { success: false; error: string };

export async function submitSmartcardFeedbackAction(message: string): Promise<SmartcardFeedbackActionResult> {
  try {
    const session = await requireAdmin();
    const result = await submitSmartcardFeedback(message);
    if (!result.ok) return { success: false, error: result.error };

    await logAudit({
      userId: session.user.id,
      action: "smartcard_feedback.submitted",
      resource: "SmartcardFeedback",
      metadata: { messagePreview: message.trim().slice(0, 140) },
    });
    revalidatePath("/admin/smartcard/feedback");
    return { success: true };
  } catch (err) {
    const message2 = err instanceof Error ? err.message : "No se pudo enviar el reporte. Intenta de nuevo.";
    return { success: false, error: message2 };
  }
}
