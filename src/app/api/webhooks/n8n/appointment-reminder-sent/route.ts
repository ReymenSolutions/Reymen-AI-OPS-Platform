import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isWebhookAuthorized } from "@/lib/webhook-validator";
import { checkRateLimit } from "@/lib/rate-limit";
import { processAppointmentReminderSentEvent } from "@/lib/webhook-processors";
import { ingestWebhookEvent } from "@/lib/webhook-ingest";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-reymen-signature") ?? "";
  const timestamp = req.headers.get("x-reymen-timestamp") ?? "";
  const plainSecret = req.headers.get("x-reymen-secret") ?? "";
  const orgId = req.headers.get("x-reymen-orgid") ?? "";
  const externalEventId = req.headers.get("x-reymen-event-id") || null;

  const rawBody = await req.text();

  const org = orgId
    ? await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, n8nWebhookSecret: true } })
    : null;

  if (!org || !isWebhookAuthorized(rawBody, signature, plainSecret, org.n8nWebhookSecret, timestamp)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(`webhook:appointment-reminder-sent:${orgId}`, { limit: 120, windowMs: 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await ingestWebhookEvent(
    { organizationId: orgId, source: "n8n", eventType: "appointment_reminder.sent", payload: parsedBody, externalEventId },
    () => processAppointmentReminderSentEvent(parsedBody, orgId)
  );

  if (result.outcome === "duplicate") return NextResponse.json({ success: true, duplicate: true });
  if (result.outcome === "failed") return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}
