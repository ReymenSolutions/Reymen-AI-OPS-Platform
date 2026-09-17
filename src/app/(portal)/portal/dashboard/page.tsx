import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Zap, MessageSquare, FileText, AlertTriangle, Rocket, ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { getServerT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { getOnboardingStatus } from "@/lib/onboarding";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils";

async function getPortalMetrics(orgId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalLeads,
    newLeadsToday,
    activeAutomations,
    automationErrors,
    openConversations,
    openRequests,
    recentLeads,
    recentEvents,
  ] = await Promise.all([
    prisma.lead.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.lead.count({ where: { organizationId: orgId, deletedAt: null, createdAt: { gte: today } } }),
    prisma.automation.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
    prisma.automation.count({ where: { organizationId: orgId, status: "ERROR" } }),
    prisma.conversation.count({ where: { organizationId: orgId, status: "OPEN" } }),
    prisma.request.count({ where: { organizationId: orgId, status: "OPEN" } }),
    prisma.lead.findMany({
      where: { organizationId: orgId, deletedAt: null },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.automationEvent.findMany({
      where: { organizationId: orgId },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { automation: { select: { name: true } } },
    }),
  ]);

  return {
    totalLeads, newLeadsToday, activeAutomations, automationErrors,
    openConversations, openRequests, recentLeads, recentEvents,
  };
}

export default async function PortalDashboardPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");

  const [t, metrics, onboarding] = await Promise.all([
    getServerT(),
    getPortalMetrics(session.user.organizationId),
    getOnboardingStatus(session.user.organizationId),
  ]);

  return (
    <div>
      <PageHeader
        title={t.dashboard}
        description={`${t.welcomeBack}, ${session.user.name ?? session.user.email}`}
      />

      {!onboarding.allDone && !onboarding.onboardingCompletedAt && (
        <Link
          href="/portal/onboarding"
          className="mb-6 flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 p-4 hover:bg-brand-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Rocket className="h-5 w-5 text-brand-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-brand-900">
                Termina de configurar tu cuenta — {onboarding.completedCount} de {onboarding.totalCount} pasos completados
              </p>
              <p className="text-xs text-brand-700 mt-0.5">Completa la configuración inicial para aprovechar todo Reymen AI Ops.</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-brand-600 flex-shrink-0" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard title={t.totalLeads} value={metrics.totalLeads} icon={Users} />
        <MetricCard title={t.leadsToday} value={metrics.newLeadsToday} icon={Users} iconClassName="bg-emerald-50" />
        <MetricCard title={t.automations} value={metrics.activeAutomations} icon={Zap} />
        <MetricCard title={t.errors} value={metrics.automationErrors} icon={AlertTriangle} iconClassName="bg-red-50" />
        <MetricCard title={t.conversations} value={metrics.openConversations} icon={MessageSquare} />
        <MetricCard title={t.requests} value={metrics.openRequests} icon={FileText} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t.recentLeads}</CardTitle></CardHeader>
          <CardContent>
            {metrics.recentLeads.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">{t.noLeadsYet}</p>
            ) : (
              <div className="space-y-3">
                {metrics.recentLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{lead.name}</p>
                      <p className="text-xs text-slate-400">
                        {lead.source ?? "manual"} · {formatDate(lead.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t.automationActivity}</CardTitle></CardHeader>
          <CardContent>
            {metrics.recentEvents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">{t.noRecentActivity}</p>
            ) : (
              <div className="space-y-3">
                {metrics.recentEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{event.automation.name}</p>
                      <p className="text-xs text-slate-400">{formatDate(event.createdAt)}</p>
                    </div>
                    <StatusBadge status={event.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
