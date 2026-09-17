import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { AiLabWorkspace } from "@/components/portal/ai-lab/AiLabWorkspace";
import type { UserRole } from "@prisma/client";

export default async function AiLabPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AI_WHATSAPP");
  if (!can(session.user.role as UserRole, "prompts:manage")) return redirect("/portal/dashboard");

  const orgId = session.user.organizationId;

  const [prompts, sessions, testCases, experiments] = await Promise.all([
    prisma.prompt.findMany({
      where: { organizationId: orgId },
      include: { versions: { orderBy: { version: "desc" } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.aiSandboxSession.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { messages: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.promptTestCase.findMany({
      where: { organizationId: orgId },
      include: { results: { orderBy: { createdAt: "desc" }, take: 5 } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.promptExperiment.findMany({
      where: { organizationId: orgId },
      include: { variantA: true, variantB: true, samples: { orderBy: { createdAt: "desc" } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Laboratorio de IA"
        description="Sandbox de conversaciones, versionado de prompts, pruebas A/B y casos guardados"
      />

      <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 p-3">
        <p className="text-sm text-blue-700">
          <strong>¿Cómo funciona?</strong> Cada mensaje de prueba se envía al workflow de n8n configurado en
          la ruta <code className="font-mono">ai-lab-test</code> para esta organización, que genera la
          respuesta real igual que lo haría el asistente en producción — nada aquí es una simulación local.
        </p>
      </div>

      <AiLabWorkspace
        prompts={prompts}
        initialSessions={sessions}
        initialTestCases={testCases}
        initialExperiments={experiments}
      />
    </div>
  );
}

export const metadata = { title: "Laboratorio de IA" };
