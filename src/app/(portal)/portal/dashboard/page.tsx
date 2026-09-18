import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Zap, MessageSquare, FileText, AlertTriangle, CheckCircle2, Rocket, ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { getOnboardingStatus } from "@/lib/onboarding";
import { getEnabledModules } from "@/lib/modules";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils";
import type { PlatformModule } from "@prisma/client";

async function getPortalMetrics(orgId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalLeads,
    newLeadsToday,
    activeAutomations,
    automationErrors,
    openConversations,
    escalatedConversations,
    openRequests,
    recentLeads,
    recentEvents,
  ] = await Promise.all([
    prisma.lead.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.lead.count({ where: { organizationId: orgId, deletedAt: null, createdAt: { gte: today } } }),
    prisma.automation.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
    prisma.automation.count({ where: { organizationId: orgId, status: "ERROR" } }),
    prisma.conversation.count({ where: { organizationId: orgId, status: "OPEN" } }),
    prisma.conversation.count({ where: { organizationId: orgId, status: "ESCALATED" } }),
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
    openConversations, escalatedConversations, openRequests, recentLeads, recentEvents,
  };
}

export default async function PortalDashboardPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");

  const [t, lang, metrics, onboarding, enabledModules] = await Promise.all([
    getServerT(),
    getServerLang(),
    getPortalMetrics(session.user.organizationId),
    getOnboardingStatus(session.user.organizationId),
    getEnabledModules(session.user.organizationId),
  ]);

  const hasModule = (m: PlatformModule) => enabledModules.includes(m);

  // Actionable, module-aware: only items the client can actually do something
  // about right now, each linking straight to where they'd fix it. A disabled
  // module's data never shows up here as something to act on.
  const needsAttention: { label: string; count: number; href: string }[] = [];
  if (hasModule("AUTOMATIONS") && metrics.automationErrors > 0) {
    needsAttention.push({ label: t.dashboardAutomationErrorsNote, count: metrics.automationErrors, href: "/portal/automations" });
  }
  if (hasModule("AI_WHATSAPP") && metrics.escalatedConversations > 0) {
    needsAttention.push({ label: t.dashboardEscalatedNote, count: metrics.escalatedConversations, href: "/portal/conversations" });
  }
  if (metrics.openRequests > 0) {
    needsAttention.push({ label: t.dashboardOpenRequestsNote, count: metrics.openRequests, href: "/portal/requests" });
  }

  return (
    <div>
      <PageHeader
        title={t.dashboard}
        description={`${t.welcomeBack}, ${session.user.name ?? session.user.email}`}
      />

      {!onboarding.allDone && !onboarding.onboardingCompletedAt && (
        <Link
          href="/portal/onboarding"
          className="info-box mb-6 flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 p-4 hover:bg-brand-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Rocket className="info-box-icon h-5 w-5 text-brand-600 flex-shrink-0" />
            <div>
              <p className="info-box-title text-sm font-medium text-brand-900">
                {lang === "es"
                  ? `Termina de configurar tu cuenta — ${onboarding.completedCount} de ${onboarding.totalCount} pasos completados`
                  : `Finish setting up your account — ${onboarding.completedCount} of ${onboarding.totalCount} steps completed`}
              </p>
              <p className="info-box-text text-xs text-brand-700 mt-0.5">
                {lang === "es"
                  ? "Completa la configuración inicial para aprovechar todo Reymen AI Ops."
                  : "Complete the initial setup to get the most out of Reymen AI Ops."}
              </p>
            </div>
          </div>
          <ArrowRight className="info-box-icon h-4 w-4 text-brand-600 flex-shrink-0" />
        </Link>
      )}

      <Card className={`mb-6 ${needsAttention.length > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <CardContent className="p-4">
          {needsAttention.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                {t.dashboardNeedsAttention}
              </div>
              {needsAttention.map((item) => (
                <Link key={item.label} href={item.href} className="text-sm text-amber-700 hover:underline">
                  <strong>{item.count}</strong> {item.label}
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              {t.dashboardAllClear}
            </div>
          )}
        </CardContent>
      </Card>

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
