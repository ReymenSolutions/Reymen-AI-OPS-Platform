import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateOrgRequest } from "@/lib/api-key-auth";
import type { FollowUpLog } from "@prisma/client";

// Internal n8n query: GET /api/v1/leads/due-followups?orgId=xxx
// n8n polls this on its own schedule (no cron inside the platform — see
// docs/DOCUMENTACION_TECNICA.md §7) and sends the actual follow-up message
// for each row returned, then reports each send via
// POST /api/webhooks/n8n/followup-sent so attempts are counted correctly
// and a rule never exceeds its own maxAttempts. Secured the same way as
// /api/v1/knowledge-base: X-Api-Key matched against THAT organization's own
// n8nWebhookSecret, or a NextAuth session for browser callers.
export async function GET(req: NextRequest) {
  const authResult = await authenticateOrgRequest(req);
  if (authResult.response) return authResult.response;
  const orgId = authResult.orgId;

  const rules = await prisma.followUpRule.findMany({ where: { organizationId: orgId, isActive: true } });
  if (rules.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const now = new Date();

  const dueByRule = await Promise.all(
    rules.map(async (rule) => {
      const cutoff = new Date(now.getTime() - rule.delayMinutes * 60 * 1000);
      const candidates = await prisma.lead.findMany({
        where: {
          organizationId: orgId,
          status: rule.triggerStatus,
          doNotContact: false,
          deletedAt: null,
          updatedAt: { lte: cutoff },
        },
        select: { id: true, name: true, phone: true, email: true },
      });
      if (candidates.length === 0) return [];

      const logs = await prisma.followUpLog.findMany({
        where: { ruleId: rule.id, leadId: { in: candidates.map((c) => c.id) } },
        orderBy: { sentAt: "desc" },
      });
      const logsByLead = new Map<string, FollowUpLog[]>();
      for (const log of logs) {
        const arr = logsByLead.get(log.leadId) ?? [];
        arr.push(log);
        logsByLead.set(log.leadId, arr);
      }

      return candidates
        .filter((c) => {
          const leadLogs = logsByLead.get(c.id) ?? [];
          if (leadLogs.length === 0) return true; // never attempted — the delayMinutes cutoff above already applies
          if (leadLogs.length >= rule.maxAttempts) return false;
          if (!rule.repeatIntervalMinutes) return false; // single-fire rule already used its one attempt
          const lastAttempt = leadLogs[0].sentAt;
          return lastAttempt.getTime() <= now.getTime() - rule.repeatIntervalMinutes * 60 * 1000;
        })
        .map((c) => ({
          leadId: c.id,
          ruleId: rule.id,
          channel: rule.channel,
          template: rule.template,
          attemptNumber: (logsByLead.get(c.id)?.length ?? 0) + 1,
          contactName: c.name,
          contactPhone: c.phone,
          contactEmail: c.email,
        }));
    })
  );

  return NextResponse.json({ data: dueByRule.flat() });
}
