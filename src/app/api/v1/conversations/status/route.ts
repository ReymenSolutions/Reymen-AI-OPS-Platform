import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { secretsMatch } from "@/lib/webhook-validator";

// Internal n8n query: GET /api/v1/conversations/status?orgId=xxx&contactPhone=xxx
// (or &conversationId=xxx). n8n's AI-reply workflow calls this before
// generating an automatic reply — if aiHandled is false, a human has taken
// or been given control and the bot must stay quiet instead of racing a
// manual reply. Secured the same way as /api/v1/knowledge-base: X-Api-Key
// matched against THAT organization's own n8nWebhookSecret, or a NextAuth
// session for browser callers.
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

  const conversationId = searchParams.get("conversationId") ?? undefined;
  const contactPhone = searchParams.get("contactPhone") ?? undefined;

  if (!conversationId && !contactPhone) {
    return NextResponse.json({ error: "conversationId or contactPhone required" }, { status: 400 });
  }

  const conversation = conversationId
    ? await prisma.conversation.findFirst({
        where: { id: conversationId, organizationId: orgId },
        select: { id: true, status: true, aiHandled: true, assignedToId: true },
      })
    : await prisma.conversation.findFirst({
        where: { organizationId: orgId, contactPhone, status: { in: ["OPEN", "ESCALATED"] } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, status: true, aiHandled: true, assignedToId: true },
      });

  // No open conversation yet for this contact — the bot is free to create
  // one and respond, matching the aiHandled=true default a new Conversation
  // gets when the inbound message webhook first creates it.
  if (!conversation) {
    return NextResponse.json({ data: { conversationId: null, aiHandled: true, status: null, assignedToId: null } });
  }

  return NextResponse.json({
    data: {
      conversationId: conversation.id,
      aiHandled: conversation.aiHandled,
      status: conversation.status,
      assignedToId: conversation.assignedToId,
    },
  });
}
