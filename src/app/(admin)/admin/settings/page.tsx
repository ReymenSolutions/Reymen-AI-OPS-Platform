import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TwoFactorSettings } from "@/components/admin/TwoFactorSettings";

async function getSystemStats() {
  const [totalOrgs, totalUsers, totalLeads, totalAutomations, totalTemplates, activeInstallations] = await Promise.all([
    prisma.organization.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.lead.count({ where: { deletedAt: null } }),
    prisma.automation.count(),
    prisma.automationTemplate.count({ where: { isPublished: true } }),
    prisma.templateInstallation.count({ where: { status: "ACTIVE" } }),
  ]);
  return { totalOrgs, totalUsers, totalLeads, totalAutomations, totalTemplates, activeInstallations };
}

export default async function AdminSettingsPage() {
  const [session, t, stats] = await Promise.all([auth(), getServerT(), getSystemStats()]);

  const totpEnabled = session?.user.id
    ? (await prisma.user.findUnique({ where: { id: session.user.id }, select: { totpEnabled: true } }))
        ?.totpEnabled ?? false
    : false;

  const systemStatRows = [
    { label: t.adminActiveOrgs, value: stats.totalOrgs },
    { label: t.adminActiveUsers, value: stats.totalUsers },
    { label: t.totalLeads, value: stats.totalLeads.toLocaleString("en-US") },
    { label: t.automations, value: stats.totalAutomations },
    { label: t.adminPublishedTemplates, value: stats.totalTemplates },
    { label: t.adminActiveInstallations, value: stats.activeInstallations },
  ];

  const sessionRows = [
    { label: t.adminUserLabel, value: session?.user.name ?? "—" },
    { label: "Email", value: session?.user.email ?? "—" },
    { label: t.adminRoleLabel, value: <Badge variant="secondary" className="capitalize">{session?.user.role?.toLowerCase()}</Badge> },
    { label: "ID", value: <span className="font-mono text-xs text-slate-400">{session?.user.id?.slice(-12)}</span> },
  ];

  return (
    <div>
      <PageHeader title={t.adminSettingsTitle} description={t.adminSettingsDesc} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t.adminSystemStats}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {systemStatRows.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="font-bold text-slate-900">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t.adminCurrentSession}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {sessionRows.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="font-medium text-slate-900">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t.adminTwoFactorAuth}</CardTitle></CardHeader>
          <CardContent>
            <TwoFactorSettings initialEnabled={totpEnabled} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t.adminRequiredEnvVars}</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg bg-slate-950 p-4 font-mono text-xs text-slate-300 space-y-1">
              {[
                "DATABASE_URL",
                "AUTH_SECRET",
                "N8N_BASE_URL",
                "N8N_WEBHOOK_SECRET",
                "CRON_SECRET",
              ].map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-brand-400">{key}</span>
                  <span className="text-slate-500">=</span>
                  <span className="text-slate-400">{"*".repeat(16)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {t.adminEnvVarInfo}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
