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

const dishVariantIngredientSchema = z.object({
  inventoryItemId: z.string().min(1),
  quantity: z.coerce.number().positive(),
});

const dishVariantSchema = z.object({
  label: z.string().min(1, "Nombre de variante requerido"),
  price: z.coerce.number().positive("El precio debe ser mayor a 0"),
  ingredients: z.array(dishVariantIngredientSchema).min(1, "Agrega al menos un insumo"),
});

const dishSchema = z
  .object({
    name: z.string().min(1, "Nombre requerido"),
    categoryId: z.string().nullable().optional(),
    modifierGroupIds: z.array(z.string()).optional(),
    variants: z.array(dishVariantSchema).min(1, "Agrega al menos una variante"),
  })
  .refine((data) => new Set(data.variants.map((v) => v.label.trim().toLowerCase())).size === data.variants.length, {
    message: "Los nombres de las variantes deben ser distintos",
    path: ["variants"],
  });

type DishInput = {
  name: string;
  categoryId?: string | null;
  modifierGroupIds?: string[];
  variants: { label: string; price: number; ingredients: { inventoryItemId: string; quantity: number }[] }[];
};

/** Confirma que categoryId (si viene) y todos los modifierGroupIds pertenecen a esta organización. */
async function assertDishRefsOwnedByOrg(organizationId: string, categoryId?: string | null, modifierGroupIds?: string[]) {
  if (categoryId) {
    const category = await prisma.foodDishCategory.findFirst({ where: { id: categoryId, organizationId } });
    if (!category) throw new Error("Categoría no encontrada");
  }
  if (modifierGroupIds && modifierGroupIds.length > 0) {
    const owned = await prisma.foodModifierGroup.count({ where: { id: { in: modifierGroupIds }, organizationId } });
    if (owned !== new Set(modifierGroupIds).size) throw new Error("Uno o más grupos de modificadores no son válidos");
  }
}

export async function createFoodDish(data: DishInput) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = dishSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos de platillo inválidos");

  const existing = await prisma.foodDish.findUnique({
    where: { organizationId_name: { organizationId: session.user.organizationId, name: parsed.data.name } },
  });
  if (existing) throw new Error("Ya existe un platillo con ese nombre");

  await assertDishRefsOwnedByOrg(session.user.organizationId, parsed.data.categoryId, parsed.data.modifierGroupIds);

  const dish = await prisma.foodDish.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      categoryId: parsed.data.categoryId || null,
      variants: {
        create: parsed.data.variants.map((v) => ({
          organizationId: session.user.organizationId!,
          label: v.label,
          price: v.price,
          ingredients: { create: v.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity })) },
        })),
      },
      modifierGroups: {
        create: (parsed.data.modifierGroupIds ?? []).map((groupId) => ({ groupId })),
      },
    },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_create",
    resource: "FoodDish",
    resourceId: dish.id,
    metadata: { name: dish.name, variants: parsed.data.variants.length },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food/profitability");
  revalidatePath("/portal/food");
}

export async function updateFoodDish(dishId: string, data: DishInput) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = dishSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos de platillo inválidos");

  const dish = await prisma.foodDish.findFirst({ where: { id: dishId, organizationId: session.user.organizationId } });
  if (!dish) throw new Error("Platillo no encontrado");

  await assertDishRefsOwnedByOrg(session.user.organizationId, parsed.data.categoryId, parsed.data.modifierGroupIds);

  // Reemplaza la lista completa de variantes (y con ellas, sus ingredientes
  // vía onDelete: Cascade) y de grupos de modificadores asignados en una
  // sola transacción -- más simple y menos propenso a errores que intentar
  // diffear cuáles se agregaron/quitaron/cambiaron desde el formulario.
  await prisma.$transaction([
    prisma.foodDishVariant.deleteMany({ where: { dishId } }),
    prisma.foodDishModifierGroup.deleteMany({ where: { dishId } }),
    prisma.foodDish.update({
      where: { id: dishId },
      data: {
        name: parsed.data.name,
        categoryId: parsed.data.categoryId || null,
        variants: {
          create: parsed.data.variants.map((v) => ({
            organizationId: session.user.organizationId!,
            label: v.label,
            price: v.price,
            ingredients: { create: v.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, quantity: i.quantity })) },
          })),
        },
        modifierGroups: {
          create: (parsed.data.modifierGroupIds ?? []).map((groupId) => ({ groupId })),
        },
      },
    }),
  ]);

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_update",
    resource: "FoodDish",
    resourceId: dishId,
    metadata: { name: parsed.data.name, variants: parsed.data.variants.length },
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

// ─── FOOD OPS — Categorías de menú (Fase 17) ─────────────────────────

const dishCategorySchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  sortOrder: z.coerce.number().int().optional(),
});

export async function createFoodDishCategory(data: { name: string; sortOrder?: number }) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = dishCategorySchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos de categoría inválidos");

  const existing = await prisma.foodDishCategory.findUnique({
    where: { organizationId_name: { organizationId: session.user.organizationId, name: parsed.data.name } },
  });
  if (existing) throw new Error("Ya existe una categoría con ese nombre");

  const category = await prisma.foodDishCategory.create({
    data: { organizationId: session.user.organizationId, name: parsed.data.name, sortOrder: parsed.data.sortOrder ?? 0 },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_category_create",
    resource: "FoodDishCategory",
    resourceId: category.id,
    metadata: { name: category.name },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food");
}

export async function updateFoodDishCategory(categoryId: string, data: { name: string; sortOrder?: number }) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = dishCategorySchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos de categoría inválidos");

  const category = await prisma.foodDishCategory.findFirst({ where: { id: categoryId, organizationId: session.user.organizationId } });
  if (!category) throw new Error("Categoría no encontrada");

  await prisma.foodDishCategory.update({
    where: { id: categoryId },
    data: { name: parsed.data.name, sortOrder: parsed.data.sortOrder ?? category.sortOrder },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_category_update",
    resource: "FoodDishCategory",
    resourceId: categoryId,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food");
}

/** Borra la categoría -- los platillos que la tenían quedan sin categoría (onDelete: SetNull), nunca se borran. */
export async function deleteFoodDishCategory(categoryId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const category = await prisma.foodDishCategory.findFirst({ where: { id: categoryId, organizationId: session.user.organizationId } });
  if (!category) throw new Error("Categoría no encontrada");

  await prisma.foodDishCategory.delete({ where: { id: categoryId } });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.dish_category_delete",
    resource: "FoodDishCategory",
    resourceId: categoryId,
    metadata: { name: category.name },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food");
}

// ─── FOOD OPS — Grupos de modificadores (Fase 17) ────────────────────

const modifierOptionSchema = z.object({
  name: z.string().min(1, "Nombre de opción requerido"),
  priceDelta: z.coerce.number().min(0, "El precio adicional no puede ser negativo"),
});

const modifierGroupSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  minSelect: z.coerce.number().int().min(0),
  maxSelect: z.coerce.number().int().min(1),
  options: z.array(modifierOptionSchema).min(1, "Agrega al menos una opción"),
});

type ModifierGroupInput = { name: string; minSelect: number; maxSelect: number; options: { name: string; priceDelta: number }[] };

export async function createFoodModifierGroup(data: ModifierGroupInput) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = modifierGroupSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos de modificador inválidos");
  if (parsed.data.minSelect > parsed.data.maxSelect) throw new Error("El mínimo no puede ser mayor al máximo");

  const existing = await prisma.foodModifierGroup.findUnique({
    where: { organizationId_name: { organizationId: session.user.organizationId, name: parsed.data.name } },
  });
  if (existing) throw new Error("Ya existe un grupo de modificadores con ese nombre");

  const group = await prisma.foodModifierGroup.create({
    data: {
      organizationId: session.user.organizationId,
      name: parsed.data.name,
      minSelect: parsed.data.minSelect,
      maxSelect: parsed.data.maxSelect,
      options: { create: parsed.data.options.map((o) => ({ name: o.name, priceDelta: o.priceDelta })) },
    },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.modifier_group_create",
    resource: "FoodModifierGroup",
    resourceId: group.id,
    metadata: { name: group.name, options: parsed.data.options.length },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food");
}

export async function updateFoodModifierGroup(groupId: string, data: ModifierGroupInput) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = modifierGroupSchema.safeParse(data);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "Datos de modificador inválidos");
  if (parsed.data.minSelect > parsed.data.maxSelect) throw new Error("El mínimo no puede ser mayor al máximo");

  const group = await prisma.foodModifierGroup.findFirst({ where: { id: groupId, organizationId: session.user.organizationId } });
  if (!group) throw new Error("Grupo de modificadores no encontrado");

  // Reemplaza la lista completa de opciones en una sola transacción --
  // mismo criterio que updateFoodDish() con sus variantes.
  await prisma.$transaction([
    prisma.foodModifierOption.deleteMany({ where: { groupId } }),
    prisma.foodModifierGroup.update({
      where: { id: groupId },
      data: {
        name: parsed.data.name,
        minSelect: parsed.data.minSelect,
        maxSelect: parsed.data.maxSelect,
        options: { create: parsed.data.options.map((o) => ({ name: o.name, priceDelta: o.priceDelta })) },
      },
    }),
  ]);

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.modifier_group_update",
    resource: "FoodModifierGroup",
    resourceId: groupId,
    metadata: { name: parsed.data.name, options: parsed.data.options.length },
  });

  revalidatePath("/portal/food/recipes");
  revalidatePath("/portal/food");
}

/** Borra el grupo -- se desvincula de cualquier platillo que lo tuviera asignado (onDelete: Cascade en el join, no en el platillo). */
export async function deleteFoodModifierGroup(groupId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const group = await prisma.foodModifierGroup.findFirst({ where: { id: groupId, organizationId: session.user.organizationId } });
  if (!group) throw new Error("Grupo de modificadores no encontrado");

  await prisma.foodModifierGroup.delete({ where: { id: groupId } });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "food.modifier_group_delete",
    resource: "FoodModifierGroup",
    resourceId: groupId,
    metadata: { name: group.name },
  });

  revalidatePath("/portal/food/recipes");
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
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().min(0),
});

const logDishSalesSchema = z.object({
  date: z.string().min(1),
  entries: z.array(dishSaleEntrySchema),
});

/**
 * Guarda "cuántas unidades de cada variante se vendieron" para UN día de
 * negocio. Volver a guardar para la misma variante/día REEMPLAZA la
 * cantidad (no la suma) -- así se puede corregir un error de captura sin
 * duplicar el conteo. Entradas con quantity=0 se guardan igual (permite
 * "hoy no vendí nada de esta variante" como dato real, no como omisión).
 */
export async function logFoodDishSales(data: { date: string; entries: { variantId: string; quantity: number }[] }) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "FOOD_OPS");

  const parsed = logDishSalesSchema.safeParse(data);
  if (!parsed.success) throw new Error("Datos de venta por platillo inválidos");
  if (parsed.data.entries.length === 0) return;

  const organizationId = session.user.organizationId;
  const occurredAt = new Date(parsed.data.date);
  occurredAt.setHours(0, 0, 0, 0);

  const variantIds = parsed.data.entries.map((e) => e.variantId);
  const ownedCount = await prisma.foodDishVariant.count({ where: { id: { in: variantIds }, dish: { organizationId } } });
  if (ownedCount !== new Set(variantIds).size) throw new Error("Una o más variantes no son válidas");

  await prisma.$transaction(
    parsed.data.entries.map((entry) =>
      prisma.foodDishSale.upsert({
        where: { variantId_occurredAt: { variantId: entry.variantId, occurredAt } },
        update: { quantity: entry.quantity },
        create: { organizationId, variantId: entry.variantId, occurredAt, quantity: entry.quantity },
      })
    )
  );

  await logAudit({
    organizationId,
    userId: session.user.id,
    action: "food.dish_sales_log",
    resource: "FoodDishSale",
    metadata: { date: parsed.data.date, variantCount: parsed.data.entries.length },
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
