import { NextResponse } from "next/server";
import { createOrgWebhookHandler } from "@/lib/org-webhook-route";
import { processFoodPosOrder } from "@/lib/food";

// Órdenes cerradas de un POS externo -- mismo esquema de auth/idempotencia
// que los webhooks de n8n (§8 de la doc técnica): firma HMAC sobre el
// cuerpo crudo, atada a un timestamp fresco, contra el n8nWebhookSecret
// PROPIO de esa organización (no hay secreto compartido). x-reymen-event-id
// debe ser el id de la orden en el POS -- una reentrega con el mismo id se
// descarta como duplicado en vez de contar la venta dos veces.
export const POST = createOrgWebhookHandler({
  rateLimitKey: "pos-orders",
  source: "pos",
  eventType: "order.completed",
  process: processFoodPosOrder,
  // Una orden rechazada (p. ej. un platillo que no existe) es un error de
  // datos del POS, no del servidor: 422 con el motivo para que el POS lo muestre.
  failureResponse: (error) => NextResponse.json({ error }, { status: 422 }),
});
