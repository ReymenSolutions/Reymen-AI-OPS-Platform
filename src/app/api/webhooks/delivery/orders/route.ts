import { NextResponse } from "next/server";
import { createOrgWebhookHandler } from "@/lib/org-webhook-route";
import { processDeliveryOrder } from "@/lib/delivery";
import { hasModule } from "@/lib/modules";

// Pedidos de Uber Eats, Rappi y DiDi Food ya normalizados (formato en
// src/lib/delivery.ts) por el integrador o un flujo de n8n. Misma
// autenticación que los demás webhooks de la organización: HMAC con su
// n8nWebhookSecret. x-reymen-event-id distinto por envío: el mismo
// externalId en otro envío actualiza el pedido (cambio de estado).
export const POST = createOrgWebhookHandler({
  rateLimitKey: "delivery-orders",
  source: "delivery",
  eventType: "delivery.order",
  process: processDeliveryOrder,
  successBody: (order) => ({ orderId: order.id, status: order.status }),
  precheck: async (organizationId) => {
    if (await hasModule(organizationId, "FOOD_OPS")) return null;
    return NextResponse.json({ error: "El módulo Food no está activo para esta organización.", code: "module_disabled" }, { status: 403 });
  },
  failureResponse: (error) => NextResponse.json({ error }, { status: 422 }),
});
