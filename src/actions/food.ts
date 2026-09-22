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
  category: z.enum(["EDIBLE", "NON_EDIBLE"]).default("EDIBLE"),
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
    category: formData.get("category") || undefined,
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
      category: parsed.data.category,
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

// ─── FOOD OPS — Platillos, gastos fijos y rentabilidad (Fase 2) ──────

const dishIngredientSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

const dishSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  price: z.coerce.number().positive("El precio debe ser mayor a 0"),
  ingredients: z.array(dishIngredientSchema),
});

export async function createFoodDish(data: { name: string; price: number; ingredients: { inventoryItemId: string; quantity: number }[] }) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = dishSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos de platillo inválidos");

  const existing = await prisma.foodDish.findUnique({
    where: { organizationId_name: { organizationId: session.user.organizationId, name: parsed.data.name } },
  });
  if (existing) throw new Error("Ya existe un platillo con ese nombre");

  const dish = await prisma.foodDish.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      price: parsed.data.price,
      ingredients: { create: parsed.data.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity })) },
    },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_create",
    resource: "FoodDish",
    resourceId: dish.id,
    metadata: { name: dish.name, price: parsed.data.price },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

export async function updateFoodDish(
  dishId: string,
  data: { name: string; price: number; ingredients: { inventoryItemId: string; quantity: number }[] }
) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = dishSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos de platillo inválidos");

  const dish = await prisma.foodDish.findFirst({ where: { id: dishId, organizationId: session.user.organizationId } });
  if (!dish) throw new Error("Platillo no encontrado");

  // Reemplaza la lista completa de ingredientes en una sola transacción --
  // más simple y menos propenso a errores que intentar diffear cuáles se
  // agregaron/quitaron/cambiaron de cantidad desde el formulario.
  await prisma.$transaction([
    prisma.foodDishIngredient.deleteMany({ where: { dishId } }),
    prisma.foodDish.update({
      where: { id: dishId },
      data: {
        name: parsed.data.name,
        price: parsed.data.price,
        ingredients: { create: parsed.data.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity })) },
      },
    }),
  ]);

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_update",
    resource: "FoodDish",
    resourceId: dishId,
    metadata: { name: parsed.data.name, price: parsed.data.price },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

export async function toggleFoodDishActive(dishId: string, isActive: boolean) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const dish = await prisma.foodDish.findFirst({ where: { id: dishId, organizationId: session.user.organizationId } });
  if (!dish) throw new Error("Platillo no encontrado");

  await prisma.foodDish.update({ where: { id: dishId }, data: { isActive } });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: isActive ? "food.dish_activate" : "food.dish_deactivate",
    resource: "FoodDish",
    resourceId: dishId,
    metadata: { name: dish.name },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

const operatingCostSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  amountMonthly: z.coerce.number().positive("El monto debe ser mayor a 0"),
});

export async function createFoodOperatingCost(data: { name: string; amountMonthly: number }) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = operatingCostSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos de gasto inválidos");

  const cost = await prisma.foodOperatingCost.create({
    data: { organizationId: session.user.organizationId, name: parsed.data.name, amountMonthly: parsed.data.amountMonthly },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.operating_cost_create",
    resource: "FoodOperatingCost",
    resourceId: cost.id,
    metadata: { name: cost.name, amountMonthly: parsed.data.amountMonthly },
  });

  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

export async function updateFoodOperatingCost(costId: string, data: { name: string; amountMonthly: number }) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = operatingCostSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos de gasto inválidos");

  const cost = await prisma.foodOperatingCost.findFirst({ where: { id: costId, organizationId: session.user.organizationId } });
  if (!cost) throw new Error("Gasto no encontrado");

  await prisma.foodOperatingCost.update({
    where: { id: costId },
    data: { name: parsed.data.name, amountMonthly: parsed.data.amountMonthly },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.operating_cost_update",
    resource: "FoodOperatingCost",
    resourceId: costId,
    metadata: { name: parsed.data.name, amountMonthly: parsed.data.amountMonthly },
  });

  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

export async function toggleFoodOperatingCostActive(costId: string, isActive: boolean) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const cost = await prisma.foodOperatingCost.findFirst({ where: { id: costId, organizationId: session.user.organizationId } });
  if (!cost) throw new Error("Gasto no encontrado");

  await prisma.foodOperatingCost.update({ where: { id: costId }, data: { isActive } });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: isActive ? "food.operating_cost_activate" : "food.operating_cost_deactivate",
    resource: "FoodOperatingCost",
    resourceId: costId,
    metadata: { name: cost.name },
  });

  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

const dishSaleEntrySchema = z.object({
  dishId: z.string().min(1),
  quantity: z.coerce.number().int().min(0),
});

const logDishSalesSchema = z.object({
  date: z.string().min(1),
  entries: z.array(dishSaleEntrySchema),
});

/**
 * Guarda "cuántas unidades de cada platillo se vendieron" para UN día de
 * negocio. Volver a guardar para el mismo platillo/día REEMPLAZA la
 * cantidad (no la suma) -- así se puede corregir un error de captura sin
 * duplicar el conteo. Entradas con quantity=0 se guardan igual (permite
 * "hoy no vendí nada de este platillo" como dato real, no como omisión).
 */
export async function logFoodDishSales(data: { date: string; entries: { dishId: string; quantity: number }[] }) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = logDishSalesSchema.safeParse(data);
  if (!parsed.success) throw new Error("Datos de venta por platillo inválidos");
  if (parsed.data.entries.length === 0) return;

  const organizationId = session.user.organizationId;
  const occurredAt = new Date(parsed.data.date);
  occurredAt.setHours(0, 0, 0, 0);

  const dishIds = parsed.data.entries.map((e) => e.dishId);
  const ownedCount = await prisma.foodDish.count({ where: { id: { in: dishIds }, organizationId } });
  if (ownedCount !== new Set(dishIds).size) throw new Error("Uno o más platillos no son válidos");

  await prisma.$transaction(
    parsed.data.entries.map((entry) =>
      prisma.foodDishSale.upsert({
        where: { dishId_occurredAt: { dishId: entry.dishId, occurredAt } },
        update: { quantity: entry.quantity },
        create: { organizationId, dishId: entry.dishId, occurredAt, quantity: entry.quantity },
      })
    )
  );

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.dish_sales_log",
    resource: "FoodDishSale",
    metadata: { date: parsed.data.date, dishCount: parsed.data.entries.length },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

export async function updateFoodTargetCostPct(pct: number) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = z.coerce.number().int().min(1).max(90).safeParse(pct);
  if (!parsed.success) throw new Error("El % objetivo debe estar entre 1 y 90");

  await prisma.organization.update({
    where: { id: session.user.organizationId },
    data: { foodTargetCostPct: parsed.data },
  });

  revalidatePath("/portal/food/profitability");
}
