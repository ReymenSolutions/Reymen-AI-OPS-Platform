import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateOrgRequest } from "@/lib/api-key-auth";

// Internal n8n query: GET /api/v1/knowledge-base?orgId=xxx&category=faq
// Secured by X-Api-Key matching THAT organization's own n8nWebhookSecret
// (never a shared secret — knowing another org's id is not enough to read
// its knowledge base), or by NextAuth session for browser callers.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const authResult = await authenticateOrgRequest(req);
  if (authResult.response) return authResult.response;
  const orgId = authResult.orgId;

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
