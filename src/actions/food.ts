"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { assertModuleEnabled } from "@/lib/modules";

// ─── FOOD OPS — Server Actions ──────────────────────────────────────
// Mismo patrón que src/actions/leads.ts (ver DOCUMENTACION_TECNICA.md §18):
// auth → module gate → validar → mutar con organizationId del lado
// servidor (nunca del formulario) → auditar → revalidatePath. Solo cubre
// Ventas, Inventario y Proveedores -- Recetas y Operación todavía no
// tienen modelo (ver el comentario en prisma/schema.prisma).

const createSaleSchema = z.object({
  occurredAt: z.string().min(1),
  channel: z.string().optional(),
  grossAmount: z.coerce.number().positive(),
  netAmount: z.coerce.number().positive(),
  notes: z.string().optional(),
});

export async function createFoodSale(formData: FormData) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = createSaleSchema.safeParse({
    occurredAt: formData.get("occurredAt"),
    channel: formData.get("channel") || undefined,
    grossAmount: formData.get("grossAmount"),
    netAmount: formData.get("netAmount"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) throw new Error("Datos de venta inválidos");
  if (parsed.data.netAmount > parsed.data.grossAmount) {
    throw new Error("El neto no puede ser mayor que el bruto");
  }

  const sale = await prisma.foodSale.create({
    data: {
      organizationId: session.user.organizationId,
      occurredAt: new Date(parsed.data.occurredAt),
      channel: parsed.data.channel ?? null,
      grossAmount: parsed.data.grossAmount,
      netAmount: parsed.data.netAmount,
      notes: parsed.data.notes ?? null,
    },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.sale_create",
    resource: "FoodSale",
    resourceId: sale.id,
    metadata: { grossAmount: parsed.data.grossAmount, channel: parsed.data.channel ?? null },
  });

  revalidatePath("/portal/food/sales");
  revalidatePath("/portal/food");
  revalidatePath("/portal/food/analytics");
}

const createInventoryItemSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  currentStock: z.coerce.number().min(0),
  minStock: z.coerce.number().min(0),
  unitCost: z.coerce.number().min(0).optional(),
});

export async function createFoodInventoryItem(formData: FormData) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = createInventoryItemSchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit"),
    currentStock: formData.get("currentStock") || 0,
    minStock: formData.get("minStock") || 0,
    unitCost: formData.get("unitCost") || undefined,
  });
  if (!parsed.success) throw new Error("Datos de insumo inválidos");

  const item = await prisma.foodInventoryItem.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      unit: parsed.data.unit,
      currentStock: parsed.data.currentStock,
      minStock: parsed.data.minStock,
      unitCost: parsed.data.unitCost ?? null,
    },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.inventory_item_create",
    resource: "FoodInventoryItem",
    resourceId: item.id,
    metadata: { name: item.name },
  });

  revalidatePath("/portal/food/inventory");
  revalidatePath("/portal/food");
}

const createSupplierSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export async function createFoodSupplier(formData: FormData) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = createSupplierSchema.safeParse({
    name: formData.get("name"),
    contactName: formData.get("contactName") || undefined,
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
  });
  if (!parsed.success) throw new Error("Datos de proveedor inválidos");

  const supplier = await prisma.foodSupplier.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      contactName: parsed.data.contactName ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email || null,
    },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.supplier_create",
    resource: "FoodSupplier",
    resourceId: supplier.id,
    metadata: { name: supplier.name },
  });

  revalidatePath("/portal/food/suppliers");
  revalidatePath("/portal/food");
}
