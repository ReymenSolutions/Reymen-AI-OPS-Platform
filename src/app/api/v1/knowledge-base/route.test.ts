// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { GET } = await import("./route");

function makeRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

describe("GET /api/v1/knowledge-base — per-organization secret isolation", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    orgA = await createTestOrg("KB Org A");
    orgB = await createTestOrg("KB Org B");
    await prisma.knowledgeBase.create({
      data: { organizationId: orgA.id, title: "Org A Secret Article", content: "confidential", isActive: true },
    });
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("returns org A's articles when authenticated with org A's own secret", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(
      makeRequest(`http://localhost/api/v1/knowledge-base?orgId=${orgA.id}`, { "x-api-key": orgA.n8nWebhookSecret })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.some((a: { title: string }) => a.title === "Org A Secret Article")).toBe(true);
  });

  it("CRITICAL: rejects org B's secret used to read org A's knowledge base", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(
      makeRequest(`http://localhost/api/v1/knowledge-base?orgId=${orgA.id}`, { "x-api-key": orgB.n8nWebhookSecret })
    );
    expect(res.status).toBe(401);
  });

  it("rejects a request with an api key but no orgId", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest("http://localhost/api/v1/knowledge-base", { "x-api-key": orgA.n8nWebhookSecret }));
    expect(res.status).toBe(400);
  });

  it("falls back to session auth when no x-api-key header is present", async () => {
    authMock.mockResolvedValue({ user: { organizationId: orgA.id } });
    const res = await GET(makeRequest(`http://localhost/api/v1/knowledge-base`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.some((a: { title: string }) => a.title === "Org A Secret Article")).toBe(true);
  });

  it("rejects an unauthenticated browser request with no session and no api key", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/knowledge-base`));
    expect(res.status).toBe(401);
  });
});
