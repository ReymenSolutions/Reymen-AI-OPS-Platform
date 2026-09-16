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

describe("GET /api/v1/conversations/status", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Conv Status Org A");
    orgB = await createTestOrg("Conv Status Org B");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("returns aiHandled:true with no conversation when none exists for that phone", async () => {
    const res = await GET(
      makeRequest(`http://localhost/api/v1/conversations/status?orgId=${orgA.id}&contactPhone=%2B15550000001`, {
        "x-api-key": orgA.n8nWebhookSecret,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ conversationId: null, aiHandled: true, status: null, assignedToId: null });
  });

  it("returns the real aiHandled/status/assignedToId for an existing open conversation", async () => {
    const user = await prisma.user.create({
      data: { email: `assignee-${Date.now()}@test.local`, name: "Assignee", role: "AGENT", organizationId: orgA.id, passwordHash: "x" },
    });
    const conv = await prisma.conversation.create({
      data: { organizationId: orgA.id, channel: "whatsapp", contactPhone: "+15550000002", aiHandled: false, assignedToId: user.id },
    });

    const res = await GET(
      makeRequest(`http://localhost/api/v1/conversations/status?orgId=${orgA.id}&contactPhone=%2B15550000002`, {
        "x-api-key": orgA.n8nWebhookSecret,
      })
    );
    const body = await res.json();
    expect(body.data).toEqual({ conversationId: conv.id, aiHandled: false, status: "OPEN", assignedToId: user.id });
  });

  it("CRITICAL: rejects a request authenticated with org B's key but targeting org A's data", async () => {
    const res = await GET(
      makeRequest(`http://localhost/api/v1/conversations/status?orgId=${orgA.id}&contactPhone=%2B15550000002`, {
        "x-api-key": orgB.n8nWebhookSecret,
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects a request with no api key and no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/conversations/status?orgId=${orgA.id}&contactPhone=%2B1`));
    expect(res.status).toBe(401);
  });

  it("requires either conversationId or contactPhone", async () => {
    const res = await GET(
      makeRequest(`http://localhost/api/v1/conversations/status?orgId=${orgA.id}`, { "x-api-key": orgA.n8nWebhookSecret })
    );
    expect(res.status).toBe(400);
  });
});
