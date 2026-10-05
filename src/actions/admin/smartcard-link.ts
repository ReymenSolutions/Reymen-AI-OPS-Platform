"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { SMARTCARD_LINK_ROLES } from "@/lib/smartcard-link-shared";
import {
  addSmartcardMember,
  linkSmartcardCompany,
  removeSmartcardMember,
  unlinkSmartcardCompany,
} from "@/lib/smartcard-link";

// Solo administradores de Reymen: escriben directo en la base de SmartCard.

function refresh(orgId: string) {
  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/admin/smartcard");
  revalidatePath("/portal/smartcard");
}

const linkSchema = z.object({ orgId: z.string().min(1), companyId: z.string().min(1) });

export async function linkSmartcardCompanyAction(data: z.infer<typeof linkSchema>) {
  const session = await requireAdmin();
  const { orgId, companyId } = linkSchema.parse(data);
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new UserError("Ese cliente no existe.");
  const company = await linkSmartcardCompany(orgId, companyId);
  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.smartcard_link",
    resource: "SmartcardCompany",
    resourceId: company.id,
    metadata: { companyName: company.name, slug: company.slug, replacedOrgId: company.staleOrgId ?? null },
  });
  refresh(orgId);
}

export async function unlinkSmartcardCompanyAction(data: { orgId: string }) {
  const session = await requireAdmin();
  const orgId = z.string().min(1).parse(data.orgId);
  await unlinkSmartcardCompany(orgId);
  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.smartcard_unlink",
    resource: "SmartcardCompany",
  });
  refresh(orgId);
}

const memberSchema = z.object({
  orgId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(SMARTCARD_LINK_ROLES),
});

/**
 * Da acceso a SmartCard a un usuario del cliente. Solo usuarios del propio
 * cliente: es el correo con el que entran a Reymen, y así se compara.
 */
export async function addSmartcardMemberAction(data: z.infer<typeof memberSchema>) {
  const session = await requireAdmin();
  const { orgId, userId, role } = memberSchema.parse(data);
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId: orgId }, select: { email: true } });
  if (!user) throw new UserError("Ese usuario no pertenece a este cliente.");
  const outcome = await addSmartcardMember(orgId, user.email, role);
  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.smartcard_member_add",
    resource: "SmartcardMember",
    resourceId: userId,
    metadata: { email: user.email, role, outcome },
  });
  refresh(orgId);
  return outcome;
}

export async function removeSmartcardMemberAction(data: { orgId: string; memberId: string; email?: string | null }) {
  const session = await requireAdmin();
  const orgId = z.string().min(1).parse(data.orgId);
  const memberId = z.string().min(1).parse(data.memberId);
  await removeSmartcardMember(orgId, memberId);
  await logAudit({
    userId: session.user.id,
    organizationId: orgId,
    action: "client.smartcard_member_remove",
    resource: "SmartcardMember",
    resourceId: memberId,
    metadata: { email: data.email ?? null },
  });
  refresh(orgId);
}
