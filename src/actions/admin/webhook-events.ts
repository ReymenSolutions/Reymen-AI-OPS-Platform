"use server";

import { revalidatePath } from "next/cache";
import { retryWebhookEvent, retryAllFailedWebhookEvents } from "@/lib/webhook-retry";
import { requireAdmin } from "@/lib/guards";


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
