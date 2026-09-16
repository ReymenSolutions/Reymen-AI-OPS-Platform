import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { secretsMatch } from "@/lib/webhook-validator";

// Internal n8n query: GET /api/v1/appointments/due-reminders?orgId=xxx
// n8n polls this on its own schedule (there is no cron inside the platform
// for this — see docs/DOCUMENTACION_TECNICA.md §7) and sends the actual
// WhatsApp reminder for each row returned, then reports success via
// POST /api/webhooks/n8n/appointment-reminder-sent so the same reminder is
// never returned (and never re-sent) again. Secured the same way as
// /api/v1/knowledge-base: X-Api-Key matched against THAT organization's own
// n8nWebhookSecret, or a NextAuth session for browser callers.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const apiKey = req.headers.get("x-api-key");

  let orgId: string;

  if (apiKey) {
    const paramOrgId = searchParams.get("orgId");
    if (!paramOrgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }

    const org = await prisma.organization.findUnique({
      where: { id: paramOrgId },
      select: { id: true, n8nWebhookSecret: true },
    });

    if (!org || !secretsMatch(apiKey, org.n8nWebhookSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    orgId = org.id;
  } else {
    const session = await auth();
    if (!session?.user.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    orgId = session.user.organizationId;
  }

  const rules = await prisma.appointmentReminderRule.findMany({
    where: { organizationId: orgId, isActive: true },
  });

  if (rules.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const now = new Date();

  const dueByRule = await Promise.all(
    rules.map(async (rule) => {
      const windowEnd = new Date(now.getTime() + rule.offsetMinutes * 60 * 1000);
      const appointments = await prisma.appointment.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          startTime: { gt: now, lte: windowEnd },
          reminderLogs: { none: { ruleId: rule.id } },
        },
        include: { lead: { select: { name: true, phone: true } } },
      });

      return appointments.map((apt) => ({
        appointmentId: apt.id,
        ruleId: rule.id,
        channel: rule.channel,
        template: rule.template,
        offsetMinutes: rule.offsetMinutes,
        title: apt.title,
        startTime: apt.startTime.toISOString(),
        contactName: apt.lead?.name ?? null,
        contactPhone: apt.lead?.phone ?? null,
      }));
    })
  );

  return NextResponse.json({ data: dueByRule.flat() });
}
