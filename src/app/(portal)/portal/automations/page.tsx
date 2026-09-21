import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { PortalSectionTabs } from "@/components/portal/PortalSectionTabs";
import { getAutomationsTabs } from "@/lib/portal-nav-tabs";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Zap, ArrowRight } from "lucide-react";

async function getAutomations(orgId: string) {
  return prisma.automation.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: {
      events: {
        take: 3,
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { events: true } },
    },
  });
}

export default async function PortalAutomationsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AUTOMATIONS");

  const [t, automations] = await Promise.all([
    getServerT(),
    getAutomations(session.user.organizationId),
  ]);

  return (
    <div>
      <PageHeader
        title={t.automations}
        description={`${automations.length} ${t.automationsConfigured}`}
      />

      <PortalSectionTabs tabs={getAutomationsTabs(t)} />

      {automations.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Zap}
              title={t.noAutomations}
              description={t.automationsEmptyDesc}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {automations.map((auto) => (
            <Card key={auto.id} className="hover:border-brand-200 hover:shadow-sm transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
                      <Zap className="h-4 w-4 text-brand-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{auto.name}</p>
                      {auto.description && (
                        <p className="text-xs text-slate-400 mt-0.5">{auto.description}</p>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={auto.status} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                  <span>{auto._count.events} {t.totalEvents}</span>
                  <div className="flex items-center gap-3">
                    <span>{t.createdOn} {formatDate(auto.createdAt)}</span>
                    <Link
                      href={`/portal/automations/${auto.id}`}
                      className="flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium"
                    >
                      {t.viewDetail} <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>

                {auto.events.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-600">{t.latestEvents}</p>
                    {auto.events.map((event) => (
                      <div key={event.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                        <p className="text-xs text-slate-600">{event.type}</p>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={event.status} />
                          <span className="text-xs text-slate-400">{formatDateTime(event.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
