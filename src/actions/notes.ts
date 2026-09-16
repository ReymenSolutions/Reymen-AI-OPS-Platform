"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";

const createSchema = z.object({
  leadId: z.string(),
  content: z.string().min(1),
});

export async function createNote(data: z.infer<typeof createSchema>) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");

  const parsed = createSchema.parse(data);
  const orgId = session.user.organizationId;

  const lead = await prisma.lead.findFirst({ where: { id: parsed.leadId, organizationId: orgId } });
  if (!lead) throw new Error("Lead no encontrado");

  const note = await prisma.note.create({
    data: {
      organizationId: orgId,
      leadId: parsed.leadId,
      authorId: session.user.id,
      content: parsed.content,
    },
  });

  revalidatePath(`/portal/leads/${parsed.leadId}`);
  return { success: true, noteId: note.id };
}

export async function deleteNote(noteId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new Error("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");

  const note = await prisma.note.findFirst({ where: { id: noteId, organizationId: session.user.organizationId } });
  if (!note) throw new Error("Nota no encontrada");

  // Only the author, or an OWNER/ADMIN/SUPER_ADMIN/MANAGER, can remove a note.
  const canManage = ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"].includes(session.user.role);
  if (note.authorId !== session.user.id && !canManage) throw new Error("No autorizado");

  await prisma.note.delete({ where: { id: noteId } });

  revalidatePath(`/portal/leads/${note.leadId}`);
  return { success: true };
}
