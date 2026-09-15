"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notifyAdmins } from "@/lib/admin-notifications";
import { escalationAlertEmail } from "@/lib/email-templates";

export async function escalateConversation(conversationId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: session.user.organizationId },
    include: { organization: { select: { name: true } } },
  });
  if (!conv) throw new Error("Conversación no encontrada");
  if (conv.status !== "OPEN") throw new Error("Solo se pueden escalar conversaciones abiertas");

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "ESCALATED", escalatedAt: new Date(), aiHandled: false },
  });

  const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/escalations`;
  const email = escalationAlertEmail(conv.organization.name, conv.contactName ?? conv.contactPhone ?? "Un contacto", adminUrl);
  await notifyAdmins(email);

  revalidatePath(`/portal/conversations/${conversationId}`);
  revalidatePath("/portal/conversations");
  revalidatePath("/portal/whatsapp");
  return { success: true };
}

const MESSAGE_PAGE_SIZE = 50;

/** Fetches the page of messages immediately before `beforeMessageId`, oldest of that page first. */
export async function getOlderMessages(conversationId: string, beforeMessageId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: session.user.organizationId },
    select: { id: true },
  });
  if (!conv) throw new Error("Conversación no encontrada");

  const cursor = await prisma.message.findUnique({
    where: { id: beforeMessageId },
    select: { createdAt: true },
  });
  if (!cursor) throw new Error("Mensaje no encontrado");

  const older = await prisma.message.findMany({
    where: {
      conversationId,
      // Compound cursor (createdAt, id) rather than createdAt alone, so two
      // messages sharing the same millisecond timestamp never get skipped.
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: beforeMessageId } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MESSAGE_PAGE_SIZE,
  });

  return { messages: older.reverse(), hasMore: older.length === MESSAGE_PAGE_SIZE };
}

export async function resolveConversation(conversationId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: session.user.organizationId },
  });
  if (!conv) throw new Error("Conversación no encontrada");

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  revalidatePath(`/portal/conversations/${conversationId}`);
  revalidatePath("/portal/conversations");
  revalidatePath("/portal/whatsapp");
  return { success: true };
}
