"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const articleSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function createArticle(data: z.infer<typeof articleSchema>) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const parsed = articleSchema.parse(data);

  await prisma.knowledgeBase.create({
    data: {
      ...parsed,
      tags: parsed.tags ?? [],
      organizationId: session.user.organizationId,
    },
  });

  revalidatePath("/portal/knowledge-base");
  return { success: true };
}

export async function updateArticle(
  id: string,
  data: z.infer<typeof articleSchema>
) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const parsed = articleSchema.parse(data);

  const article = await prisma.knowledgeBase.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });
  if (!article) throw new Error("Artículo no encontrado");

  await prisma.knowledgeBase.update({
    where: { id },
    data: { ...parsed, tags: parsed.tags ?? [] },
  });

  revalidatePath("/portal/knowledge-base");
  return { success: true };
}

export async function deleteArticle(id: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const article = await prisma.knowledgeBase.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });
  if (!article) throw new Error("Artículo no encontrado");

  await prisma.knowledgeBase.delete({ where: { id } });

  revalidatePath("/portal/knowledge-base");
  return { success: true };
}

export async function toggleArticle(id: string, isActive: boolean) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const article = await prisma.knowledgeBase.findFirst({
    where: { id, organizationId: session.user.organizationId },
  });
  if (!article) throw new Error("Artículo no encontrado");

  await prisma.knowledgeBase.update({ where: { id }, data: { isActive } });

  revalidatePath("/portal/knowledge-base");
  return { success: true };
}
