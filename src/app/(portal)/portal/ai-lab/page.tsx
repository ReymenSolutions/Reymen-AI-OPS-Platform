import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { AiLabWorkspace } from "@/components/portal/ai-lab/AiLabWorkspace";
import { getServerLang } from "@/lib/i18n-server";
import type { UserRole } from "@prisma/client";

export default async function AiLabPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AI_WHATSAPP");
  if (!can(session.user.role as UserRole, "prompts:manage")) return redirect("/portal/dashboard");

  const orgId = session.user.organizationId;
  const lang = await getServerLang();

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
        title={lang === "es" ? "Laboratorio de IA" : "AI Lab"}
        description={lang === "es"
          ? "Sandbox de conversaciones, versionado de prompts, pruebas A/B y casos guardados"
          : "Conversation sandbox, prompt versioning, A/B testing and saved cases"}
      />

      <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 p-3">
        <p className="text-sm text-blue-700">
          {lang === "es" ? (
            <>
              <strong>¿Cómo funciona?</strong> Cada mensaje de prueba se envía al workflow de n8n configurado en
              la ruta <code className="font-mono">ai-lab-test</code> para esta organización, que genera la
              respuesta real igual que lo haría el asistente en producción — nada aquí es una simulación local.
            </>
          ) : (
            <>
              <strong>How does it work?</strong> Every test message is sent to the n8n workflow configured at
              the <code className="font-mono">ai-lab-test</code> route for this organization, which generates
              the real reply exactly as the assistant would in production — nothing here is a local simulation.
            </>
          )}
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
