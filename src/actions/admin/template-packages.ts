"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth, isAdmin } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(10),
  industry: z.string().min(1),
  iconEmoji: z.string().optional(),
  templateIds: z.array(z.string()).min(1, "Selecciona al menos un template"),
});

export async function createTemplatePackage(data: z.infer<typeof createSchema>) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const parsed = createSchema.parse(data);

  const templates = await prisma.automationTemplate.findMany({
    where: { id: { in: parsed.templateIds } },
    select: { id: true },
  });
  if (templates.length !== parsed.templateIds.length) {
    throw new Error("Uno o más templates seleccionados no existen");
  }

  const pkg = await prisma.templatePackage.create({
    data: {
      name: parsed.name,
      description: parsed.description,
      industry: parsed.industry,
      iconEmoji: parsed.iconEmoji ?? "📦",
      createdBy: session.user.id,
      items: {
        create: parsed.templateIds.map((templateId, order) => ({ templateId, order })),
      },
    },
  });

  revalidatePath("/admin/template-packages");
  return { success: true, packageId: pkg.id };
}

const updateItemsSchema = z.object({
  templateIds: z.array(z.string()).min(1, "Selecciona al menos un template"),
});

export async function updateTemplatePackageItems(
  packageId: string,
  data: z.infer<typeof updateItemsSchema>
) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const parsed = updateItemsSchema.parse(data);

  const [pkg, templates] = await Promise.all([
    prisma.templatePackage.findUnique({ where: { id: packageId } }),
    prisma.automationTemplate.findMany({
      where: { id: { in: parsed.templateIds } },
      select: { id: true },
    }),
  ]);
  if (!pkg) throw new Error("Paquete no encontrado");
  if (templates.length !== parsed.templateIds.length) {
    throw new Error("Uno o más templates seleccionados no existen");
  }

  // Replace the full item set — simplest correct approach for admin
  // curation of a small, hand-picked list (no drag reordering to preserve).
  await prisma.$transaction([
    prisma.templatePackageItem.deleteMany({ where: { packageId } }),
    prisma.templatePackageItem.createMany({
      data: parsed.templateIds.map((templateId, order) => ({ packageId, templateId, order })),
    }),
  ]);

  revalidatePath("/admin/template-packages");
  revalidatePath(`/admin/template-packages/${packageId}`);
  return { success: true };
}

export async function publishTemplatePackage(packageId: string, isPublished: boolean) {
  const session = await auth();
  if (!session || !isAdmin(session.user.role)) throw new Error("No autorizado");

  const pkg = await prisma.templatePackage.findUnique({
    where: { id: packageId },
    include: { items: { include: { template: { select: { isPublished: true } } } } },
  });
  if (!pkg) throw new Error("Paquete no encontrado");
  if (isPublished && !pkg.items.some((i) => i.template.isPublished)) {
    throw new Error("El paquete necesita al menos un template publicado antes de publicarse");
  }

  await prisma.templatePackage.update({
    where: { id: packageId },
    data: { isPublished },
  });

  revalidatePath("/admin/template-packages");
  revalidatePath(`/admin/template-packages/${packageId}`);
  return { success: true };
}
