"use server";

import { revalidatePath } from "next/cache";
import { auth, isAdmin } from "@/lib/auth";
import { retryWebhookEvent, retryAllFailedWebhookEvents } from "@/lib/webhook-retry";

async function requireAdmin() {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");
  return session;
}

export async function retryWebhookEventAction(id: string) {
  await requireAdmin();
  const result = await retryWebhookEvent(id);
  revalidatePath("/admin/webhooks");
  return result;
}

export async function retryAllFailedWebhookEventsAction() {
  await requireAdmin();
  const result = await retryAllFailedWebhookEvents();
  revalidatePath("/admin/webhooks");
  return result;
}
