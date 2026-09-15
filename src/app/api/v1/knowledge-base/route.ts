import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { secretsMatch } from "@/lib/webhook-validator";

// Internal n8n query: GET /api/v1/knowledge-base?orgId=xxx&category=faq
// Secured by X-Api-Key matching THAT organization's own n8nWebhookSecret
// (never a shared secret — knowing another org's id is not enough to read
// its knowledge base), or by NextAuth session for browser callers.
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

  const category = searchParams.get("category") ?? undefined;
  const search = searchParams.get("q") ?? undefined;

  const articles = await prisma.knowledgeBase.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" } },
              { content: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      tags: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: articles, meta: { total: articles.length } });
}
