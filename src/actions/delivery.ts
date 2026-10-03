"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DeliveryOrderStatus, DeliveryPlatform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireFoodManager } from "@/lib/guards";
import { DELIVERY_PLATFORMS, DELIVERY_STATUSES, processDeliveryOrder } from "@/lib/delivery";
import { UserError } from "@/lib/user-error";

// Food → Delivery: conectar plataformas y llevar el estado de sus pedidos.

function revalidateDelivery() {
  revalidatePath("/portal/food/delivery");
  revalidatePath("/portal/food/operations");
}

const channelSchema = z.object({
  platform: z.enum(DELIVERY_PLATFORMS as [DeliveryPlatform, ...DeliveryPlatform[]]),
  enabled: z.boolean(),
  storeId: z.string().trim().max(120).optional(),
});

export async function saveDeliveryChannel(data: z.input<typeof channelSchema>) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  const parsed = channelSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Datos inválidos");
  const { platform, enabled } = parsed.data;
  const storeId = parsed.data.storeId || null;
  await prisma.deliveryChannel.upsert({
    where: { organizationId_platform: { organizationId, platform } },
    create: { organizationId, platform, enabled, storeId },
    update: { enabled, storeId },
  });
  await logAudit({
    organizationId,
    userId: session.user.id,
    action: enabled ? "food.delivery_connect" : "food.delivery_disconnect",
    resource: "DeliveryChannel",
    resourceId: platform,
    metadata: { storeId },
  });
  revalidateDelivery();
}

export async function setDeliveryOrderStatus(orderId: string, status: DeliveryOrderStatus) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  if (!DELIVERY_STATUSES.includes(status)) throw new UserError("Datos inválidos");
  const order = await prisma.deliveryOrder.findFirst({ where: { id: orderId, organizationId }, select: { id: true, status: true } });
  if (!order) throw new UserError("Pedido no encontrado");
  if (order.status === status) return;
  await prisma.deliveryOrder.update({ where: { id: orderId }, data: { status, statusAt: new Date() } });
  revalidateDelivery();
}

const SAMPLE_ITEMS = [
  { name: "Hamburguesa clásica", quantity: 2, modifiers: ["Sin cebolla"], notes: "Bien cocida" },
  { name: "Papas a la francesa", quantity: 1 },
  { name: "Refresco", quantity: 2, modifiers: ["Sin hielo"] },
];

/** Crea un pedido de prueba de esa plataforma para ver el flujo sin la plataforma real. */
export async function createDeliveryTestOrder(platform: DeliveryPlatform) {
  const session = await requireFoodManager();
  const organizationId = session.user.organizationId;
  if (!DELIVERY_PLATFORMS.includes(platform)) throw new UserError("Datos inválidos");
  const code = Math.random().toString(36).slice(2, 6).toUpperCase();
  await processDeliveryOrder(
    {
      platform,
      externalId: `test-${Date.now()}-${code}`,
      displayId: code,
      customerName: "Cliente de prueba",
      total: 289,
      items: SAMPLE_ITEMS,
      notes: "Pedido de prueba creado desde Reymen",
    },
    organizationId,
    { isTest: true },
  );
  revalidateDelivery();
}

/** Borra los pedidos de prueba. */
export async function clearDeliveryTestOrders() {
  const session = await requireFoodManager();
  await prisma.deliveryOrder.deleteMany({ where: { organizationId: session.user.organizationId, isTest: true } });
  revalidateDelivery();
}
