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

describe("GET /api/v1/food/menu", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Food Menu Route Org A");
    orgB = await createTestOrg("Food Menu Route Org B");
    await prisma.organizationModule.create({ data: { organizationId: orgA.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.foodDish.create({
      data: { organizationId: orgA.id, name: "Org A Secret Dish", variants: { create: [{ organizationId: orgA.id, label: "Único", price: 50 }] } },
    });
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("returns org A's menu when authenticated with org A's own n8nWebhookSecret (backward compat)", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": orgA.n8nWebhookSecret }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.some((d: { name: string }) => d.name === "Org A Secret Dish")).toBe(true);
  });

  it("CRITICAL: rejects org B's secret used to read org A's menu", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": orgB.n8nWebhookSecret }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when FOOD_OPS isn't enabled for the org, even with a valid secret", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgB.id}`, { "x-api-key": orgB.n8nWebhookSecret }));
    expect(res.status).toBe(403);
  });

  it("accepts the separate foodPosReadKey once one has been generated", async () => {
    const readKey = "test-food-pos-read-key-12345";
    await prisma.organization.update({ where: { id: orgA.id }, data: { foodPosReadKey: readKey } });

    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgA.id}`, { "x-api-key": readKey }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.some((d: { name: string }) => d.name === "Org A Secret Dish")).toBe(true);
  });

  it("CRITICAL: org B cannot read org A's menu using org A's foodPosReadKey mismatched to org B's id", async () => {
    const readKey = "test-food-pos-read-key-mismatch";
    await prisma.organization.update({ where: { id: orgA.id }, data: { foodPosReadKey: readKey } });

    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgB.id}`, { "x-api-key": readKey }));
    expect(res.status).toBe(401);
  });

  it("rejects when foodPosReadKey is still null and the caller doesn't have the n8nWebhookSecret", async () => {
    await prisma.organization.update({ where: { id: orgB.id }, data: { foodPosReadKey: null } });
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/food/menu?orgId=${orgB.id}`, { "x-api-key": "some-guess" }));
    expect(res.status).toBe(401);
  });
});
