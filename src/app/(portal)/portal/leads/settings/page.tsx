import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { requireModule } from "@/lib/modules";
import { getServerLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FollowUpRulesManager } from "@/components/portal/FollowUpRulesManager";
import type { UserRole } from "@prisma/client";

export default async function LeadFollowUpSettingsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "CRM");
  if (!can(session.user.role as UserRole, "settings:manage")) return redirect("/portal/leads");

  const orgId = session.user.organizationId;

  const [lang, rules] = await Promise.all([
    getServerLang(),
    prisma.followUpRule.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div>
      <Link href="/portal/leads" className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" />
        {lang === "es" ? "Leads" : "Leads"}
      </Link>

      <PageHeader
        title={lang === "es" ? "Seguimientos automáticos" : "Automated follow-ups"}
        description={lang === "es" ? "Reglas de seguimiento por estado del lead" : "Follow-up rules by lead status"}
      />

      <Card>
        <CardHeader><CardTitle>{lang === "es" ? "Reglas de seguimiento" : "Follow-up rules"}</CardTitle></CardHeader>
        <CardContent>
          <FollowUpRulesManager
            initialRules={rules.map((r) => ({
              name: r.name,
              triggerStatus: r.triggerStatus,
              delayMinutes: r.delayMinutes,
              repeatIntervalMinutes: r.repeatIntervalMinutes,
              maxAttempts: r.maxAttempts,
              channel: r.channel,
              template: r.template,
              isActive: r.isActive,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
