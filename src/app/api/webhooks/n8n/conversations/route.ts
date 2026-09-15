import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isWebhookAuthorized } from "@/lib/webhook-validator";
import { checkRateLimit } from "@/lib/rate-limit";
import { processConversationEvent } from "@/lib/webhook-processors";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-reymen-signature") ?? "";
  const plainSecret = req.headers.get("x-reymen-secret") ?? "";
  const orgId = req.headers.get("x-reymen-orgid") ?? "";

  const rawBody = await req.text();

  // Authenticate against THIS organization's own webhook secret — never a
  // shared secret — so knowing another org's id is never enough to forge
  // requests into it. x-reymen-orgid is just an identifier here, not itself
  // a credential.
  const org = orgId
    ? await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, n8nWebhookSecret: true } })
    : null;

  if (!org || !isWebhookAuthorized(rawBody, signature, plainSecret, org.n8nWebhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(`webhook:conversations:${orgId}`, { limit: 120, windowMs: 60 * 1000 });
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

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      organizationId: orgId,
      source: "n8n",
      eventType: "conversation.message",
      payload: parsedBody as Prisma.InputJsonValue,
      status: "PROCESSING",
      attempts: 1,
    },
  });

  try {
    const { conversationId } = await processConversationEvent(parsedBody, orgId);

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });

    return NextResponse.json({ success: true, conversationId });
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
