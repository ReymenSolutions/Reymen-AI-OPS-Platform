import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CreateOpportunityDialog } from "@/components/portal/CreateOpportunityDialog";
import { OpportunityCard } from "@/components/portal/OpportunityCard";
import { GitBranch } from "lucide-react";
import type { UserRole } from "@prisma/client";

export default async function PortalPipelinePage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "CRM");

  const orgId = session.user.organizationId;

  const [t, lang, stages, users] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.pipelineStage.findMany({
      where: { organizationId: orgId },
      orderBy: { order: "asc" },
      include: {
        opportunities: {
          orderBy: { updatedAt: "desc" },
          include: {
            lead: { select: { id: true, name: true, phone: true } },
            owner: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const stageOptions = stages.map((s) => ({ id: s.id, name: s.name }));
  const totalOpportunities = stages.reduce((sum, s) => sum + s.opportunities.length, 0);
  const canManage = can(session.user.role as UserRole, "opportunities:manage");

  return (
    <div>
      <PageHeader
        title={t.pipelineTitle}
        description={`${totalOpportunities} ${t.pipelineDesc}`}
        actions={stages.length > 0 ? <CreateOpportunityDialog stages={stageOptions} users={users} /> : undefined}
      />

      {stages.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          title={lang === "es" ? "No hay etapas configuradas" : "No stages configured"}
          description={
            lang === "es"
              ? "Configura tu pipeline de ventas en Configuración."
              : "Set up your sales pipeline in Settings."
          }
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <div key={stage.id} className="w-72 flex-shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-slate-900">{stage.name}</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {stage.opportunities.length}
                </span>
              </div>
              <div className="space-y-2 rounded-lg bg-slate-50 p-2 min-h-[120px]">
                {stage.opportunities.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-slate-400">
                    {lang === "es" ? "Sin oportunidades" : "No opportunities"}
                  </p>
                ) : (
                  stage.opportunities.map((opp) => (
                    <OpportunityCard
                      key={opp.id}
                      opportunity={{
                        id: opp.id,
                        title: opp.title,
                        amount: opp.amount,
                        currency: opp.currency,
                        estimatedCloseDate: opp.estimatedCloseDate,
                        leadId: opp.lead.id,
                        leadName: opp.lead.name,
                        ownerName: opp.owner?.name ?? opp.owner?.email ?? null,
                        currentStageId: stage.id,
                      }}
                      stages={stageOptions}
                      canManage={canManage}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
