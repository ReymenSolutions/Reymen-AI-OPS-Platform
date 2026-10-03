// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, createTestUser, cleanupOrg, fakeSession } from "@/test/helpers";
import { isDeliveryLate, nextDeliveryStatus, parsePlatform } from "@/lib/delivery";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { POST } = await import("./route");
const actions = await import("@/actions/delivery");

let seq = 0;
function send(org: { id: string; n8nWebhookSecret: string }, payload: unknown, secret = org.n8nWebhookSecret) {
  const body = JSON.stringify(payload);
  const ts = Date.now().toString();
  return POST(
    new NextRequest("http://localhost/api/webhooks/delivery/orders", {
      method: "POST",
      headers: {
        "x-reymen-orgid": org.id,
        "x-reymen-signature": createWebhookSignature(body, secret, ts),
        "x-reymen-timestamp": ts,
        "x-reymen-event-id": `evt-${++seq}`,
      },
      body,
    }),
  );
}

const order = (extra: Record<string, unknown> = {}) => ({
  platform: "rappi",
  externalId: "rappi-1",
  displayId: "A1B2",
  customerName: "Ana",
  total: 289,
  items: [{ name: "Hamburguesa", quantity: 2, modifiers: ["Sin cebolla"] }],
  ...extra,
});

describe("delivery orders (Uber Eats, Rappi, DiDi)", () => {
  let org: { id: string; n8nWebhookSecret: string };
  let owner: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Delivery Org");
    owner = await createTestUser(org.id, "OWNER", "delivery-owner");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
  });
  afterAll(async () => {
    await prisma.deliveryOrder.deleteMany({ where: { organizationId: org.id } });
    await prisma.deliveryChannel.deleteMany({ where: { organizationId: org.id } });
    await cleanupOrg(org.id);
  });

  it("rejects orders from a platform that isn't connected", async () => {
    const res = await send(org, order());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/no está conectada/);
  });

  it("creates the order once connected, and the same externalId updates its status", async () => {
    await actions.saveDeliveryChannel({ platform: "RAPPI", enabled: true, storeId: "store-9" });
    let res = await send(org, order());
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("NEW");
    res = await send(org, order({ status: "READY" }));
    expect(res.status).toBe(200);
    const rows = await prisma.deliveryOrder.findMany({ where: { organizationId: org.id, platform: "RAPPI" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "READY", displayId: "A1B2", customerName: "Ana" });
    expect(Number(rows[0].totalAmount)).toBe(289);
  });

  it("rejects a bad signature, an unknown platform and an empty order", async () => {
    expect((await send(org, order(), "wrong")).status).toBe(401);
    expect((await send(org, order({ platform: "glovo" }))).status).toBe(422);
    expect((await send(org, order({ items: [] }))).status).toBe(422);
  });

  it("the board moves an order through its steps; test orders can be created and cleared", async () => {
    await actions.createDeliveryTestOrder("UBER_EATS");
    const test = await prisma.deliveryOrder.findFirstOrThrow({ where: { organizationId: org.id, isTest: true } });
    expect(test.status).toBe("NEW");
    await actions.setDeliveryOrderStatus(test.id, nextDeliveryStatus(test.status)!);
    expect((await prisma.deliveryOrder.findUniqueOrThrow({ where: { id: test.id } })).status).toBe("ACCEPTED");
    await actions.clearDeliveryTestOrders();
    expect(await prisma.deliveryOrder.count({ where: { organizationId: org.id, isTest: true } })).toBe(0);
  });

  it("helpers", () => {
    expect(parsePlatform("Uber Eats")).toBe("UBER_EATS");
    expect(parsePlatform("didi")).toBe("DIDI_FOOD");
    expect(parsePlatform("glovo")).toBeNull();
    expect(nextDeliveryStatus("PICKED_UP")).toBe("DELIVERED");
    expect(nextDeliveryStatus("DELIVERED")).toBeNull();
    const now = new Date("2026-10-03T20:00:00Z");
    expect(isDeliveryLate({ status: "PREPARING", placedAt: new Date("2026-10-03T19:30:00Z") }, now)).toBe(true);
    expect(isDeliveryLate({ status: "READY", placedAt: new Date("2026-10-03T19:30:00Z") }, now)).toBe(false);
  });
});
