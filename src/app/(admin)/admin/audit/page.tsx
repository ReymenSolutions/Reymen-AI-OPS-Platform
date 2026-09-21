import { prisma } from "@/lib/prisma";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { Strings } from "@/lib/i18n";

type BadgeVariant = "default" | "secondary" | "success" | "destructive" | "warning" | "info" | "outline";

function buildActionLabels(t: Strings): Record<string, { label: string; variant: BadgeVariant }> {
  return {
    "client.create":       { label: t.adminActionClientCreate,       variant: "success" },
    "client.plan_change":  { label: t.adminActionPlanChange,         variant: "info" },
    "client.status_change": { label: t.adminActionClientStatusChange, variant: "warning" },
    "team.invite":         { label: t.adminActionTeamInvite,         variant: "success" },
    "team.remove":         { label: t.adminActionTeamRemove,         variant: "warning" },
    "template.install":    { label: t.adminActionTemplateInstall,    variant: "success" },
    "template.uninstall":  { label: t.adminActionTemplateUninstall,  variant: "warning" },
    "lead.create":         { label: t.adminActionLeadCreate,         variant: "default" },
    "lead.delete":         { label: t.adminActionLeadDelete,         variant: "destructive" },
    "prompt.activate":     { label: t.adminActionPromptActivate,     variant: "info" },
  };
}

async function getAuditLogs(orgId?: string) {
  const [logs, orgs] = await Promise.all([
    prisma.auditLog.findMany({
      where: orgId ? { organizationId: orgId } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { organization: { select: { name: true } } },
    }),
    prisma.organization.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { logs, orgs };
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const [t, { logs, orgs }] = await Promise.all([getServerT(), getAuditLogs(org)]);
  const actionLabels = buildActionLabels(t);

  return (
    <div>
      <PageHeader
        title={t.adminAuditTitle}
        description={`${logs.length} ${t.adminEventsRegistered}${org ? " (filtrado)" : ""}`}
      />

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <a
          href="/admin/audit"
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            !org ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {t.adminFilterAll}
        </a>
        {orgs.map((o) => (
          <a
            key={o.id}
            href={`/admin/audit?org=${o.id}`}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              org === o.id ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {o.name}
          </a>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            {t.adminActivityLog}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t.adminNoAuditEvents}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((log) => {
                const cfg = actionLabels[log.action];
                return (
                  <div key={log.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {cfg ? (
                          <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs font-mono">{log.action}</Badge>
                        )}
                        <span className="text-sm text-slate-700 font-medium">{log.resource}</span>
                        {log.resourceId && (
                          <span className="text-xs text-slate-400 font-mono truncate max-w-[120px]">
                            {log.resourceId}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {log.organization && (
                          <span className="text-xs text-slate-500">{log.organization.name}</span>
                        )}
                        {log.userId && (
                          <span className="text-xs text-slate-400 font-mono">uid:{log.userId.slice(-8)}</span>
                        )}
                        {log.metadata && (
                          <span className="text-xs text-slate-400 truncate max-w-xs">
                            {JSON.stringify(log.metadata)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
