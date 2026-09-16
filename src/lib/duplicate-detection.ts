import { prisma } from "./prisma";
import type { Lead } from "@prisma/client";

/** Digits only, so "+52 55 1234-5678" and "5215512345678" compare equal. */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Finds existing leads in the same org that plausibly refer to the same
 * contact as {name, email, phone} — matched on normalized email OR
 * normalized phone (either is enough; a shared phone with a different name
 * is still worth surfacing, e.g. a couple sharing a household number).
 * Never used to block creation — only to surface a "possible duplicate,
 * review?" prompt, since two different people can legitimately share an
 * email (a shared company inbox) or a phone.
 */
export async function findPotentialDuplicateLeads(
  organizationId: string,
  contact: { email?: string | null; phone?: string | null },
  excludeLeadId?: string
): Promise<Lead[]> {
  const normalizedEmail = contact.email ? normalizeEmail(contact.email) : null;
  const normalizedPhone = contact.phone ? normalizePhone(contact.phone) : null;

  if (!normalizedEmail && !normalizedPhone) return [];

  const candidates = await prisma.lead.findMany({
    where: {
      organizationId,
      deletedAt: null,
      id: excludeLeadId ? { not: excludeLeadId } : undefined,
      OR: [
        ...(normalizedEmail ? [{ email: { not: null } }] : []),
        ...(normalizedPhone ? [{ phone: { not: null } }] : []),
      ],
    },
    take: 200, // normalization can't be pushed into SQL portably here; bound the scan
  });

  return candidates.filter((lead) => {
    const emailMatches = normalizedEmail && lead.email && normalizeEmail(lead.email) === normalizedEmail;
    const phoneMatches = normalizedPhone && lead.phone && normalizePhone(lead.phone) === normalizedPhone;
    return Boolean(emailMatches || phoneMatches);
  });
}
