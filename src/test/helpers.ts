import { prisma } from "@/lib/prisma";
import { generateSlug, generateWebhookSecret } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

export async function createTestOrg(namePrefix: string) {
  const name = `${namePrefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.organization.create({
    data: { name, slug: generateSlug(name), n8nWebhookSecret: generateWebhookSecret() },
  });
}

export async function createTestUser(orgId: string | null, role: UserRole, emailPrefix: string) {
  const email = `${emailPrefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@test.local`;
  return prisma.user.create({
    data: { email, name: "Test User", role, organizationId: orgId, passwordHash: "unused" },
  });
}

export function fakeSession(user: { id: string; role: UserRole; organizationId: string | null; email?: string | null; name?: string | null }) {
  return {
    user: {
      id: user.id,
      role: user.role,
      organizationId: user.organizationId,
      email: user.email ?? "test@test.local",
      name: user.name ?? "Test User",
      theme: "light",
      language: "es",
      impersonating: null,
    },
    expires: new Date(Date.now() + 3600_000).toISOString(),
  };
}

/** Deletes an org and everything scoped to it, in FK-safe order. Best-effort — used for test cleanup only. */
export async function cleanupOrg(orgId: string) {
  await prisma.automationEvent.deleteMany({ where: { organizationId: orgId } });
  await prisma.message.deleteMany({ where: { conversation: { organizationId: orgId } } });
  await prisma.conversation.deleteMany({ where: { organizationId: orgId } });
  await prisma.appointment.deleteMany({ where: { organizationId: orgId } });
  await prisma.request.deleteMany({ where: { organizationId: orgId } });
  await prisma.lead.deleteMany({ where: { organizationId: orgId } });
  await prisma.automation.deleteMany({ where: { organizationId: orgId } });
  await prisma.prompt.deleteMany({ where: { organizationId: orgId } });
  await prisma.knowledgeBase.deleteMany({ where: { organizationId: orgId } });
  await prisma.whatsAppAssistant.deleteMany({ where: { organizationId: orgId } });
  await prisma.templateInstallation.deleteMany({ where: { organizationId: orgId } });
  await prisma.webhookEvent.deleteMany({ where: { organizationId: orgId } });
  await prisma.metric.deleteMany({ where: { organizationId: orgId } });
  await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
}

export { generateWebhookSecret };
