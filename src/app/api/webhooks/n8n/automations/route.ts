import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isWebhookAuthorized } from "@/lib/webhook-validator";
import { checkRateLimit } from "@/lib/rate-limit";
import { processAutomationEvent } from "@/lib/webhook-processors";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-reymen-signature") ?? "";
  const plainSecret = req.headers.get("x-reymen-secret") ?? "";

  const rawBody = await req.text();

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const automationId = (parsedBody as { automationId?: string }).automationId;
  if (!automationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit on the claimed automationId before authenticating, so
  // brute-forcing a webhookSecret for a known automation gets throttled
  // the same as legitimate high-volume traffic would.
  const rateLimit = await checkRateLimit(`webhook:automations:${automationId}`, { limit: 60, windowMs: 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const automation = await prisma.automation.findUnique({ where: { id: automationId } });

  // Authenticate against this specific automation's own webhook secret,
  // matching what the admin panel's Webhook Info dialog documents to n8n.
  if (!automation || !isWebhookAuthorized(rawBody, signature, plainSecret, automation.webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = automation.organizationId;

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      organizationId: orgId,
      source: "n8n",
      eventType: "automation.event",
      payload: parsedBody as Prisma.InputJsonValue,
      status: "PROCESSING",
      attempts: 1,
    },
  });

  try {
    await processAutomationEvent(parsedBody, orgId);

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
