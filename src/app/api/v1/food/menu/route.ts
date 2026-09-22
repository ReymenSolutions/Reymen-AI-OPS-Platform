import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { secretsMatch } from "@/lib/webhook-validator";
import { hasModule } from "@/lib/modules";
import { getFoodMenuForPos, getFoodDishCategories } from "@/lib/food";

// Menú (platillos + categoría + variantes + precio + externalPosId + grupos
// de modificadores asignados) para un futuro integrador externo (POS
// propio, kiosko, etc.) -- mismo esquema de auth que /api/v1/knowledge-base:
// X-Api-Key contra el n8nWebhookSecret de ESA organización, o sesión de
// NextAuth para llamadas desde el navegador. También acepta la llave
// separada foodPosReadKey (Fase 17) para que el dispositivo POS pueda leer
// el menú sin guardar la misma llave que firma /api/webhooks/pos/orders --
// esa firma debe quedarse en el servidor del POS, no en el punto de venta.
// GET /api/v1/food/menu?orgId=xxx
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const apiKey = req.headers.get("x-api-key");

  let orgId: string;

  if (apiKey) {
    const paramOrgId = searchParams.get("orgId");
    if (!paramOrgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: paramOrgId },
      select: { id: true, n8nWebhookSecret: true, foodPosReadKey: true },
    });

    const authorized =
      !!org &&
      (secretsMatch(apiKey, org.n8nWebhookSecret) || (!!org.foodPosReadKey && secretsMatch(apiKey, org.foodPosReadKey)));

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    orgId = org.id;
  } else {
    const session = await auth();
    if (!session?.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    orgId = session.user.organizationId;
  }

  if (!(await hasModule(orgId, "FOOD_OPS"))) {
    return NextResponse.json({ error: "Food module not enabled for this organization" }, { status: 403 });
  }

  const [dishes, categories] = await Promise.all([getFoodMenuForPos(orgId), getFoodDishCategories(orgId)]);
  return NextResponse.json({
    data: dishes,
    categories: categories.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder })),
    meta: { total: dishes.length },
  });
}
