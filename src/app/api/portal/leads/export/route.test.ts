// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
const authMock = vi.fn();

const { GET } = await import("./route");

describe("GET /api/portal/leads/export", () => {
  it("rejects an unauthenticated request", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("neutralizes formula-injection payloads in exported cells", async () => {
    const org = await createTestOrg("CSV Export Org");
    await prisma.lead.create({
      data: { organizationId: org.id, name: "=cmd|'/c calc'!A1", notes: "+SUM(1,1)" },
    });
    await prisma.lead.create({
      data: { organizationId: org.id, name: "Normal Name", notes: "@mention risk" },
    });

    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));
    const res = await GET();
    const csv = await res.text();

    expect(csv).toContain("'=cmd|'/c calc'!A1");
    expect(csv).toContain("'+SUM(1,1)");
    expect(csv).toContain("'@mention risk");
    expect(csv).toContain("Normal Name");
    // Never emit an un-prefixed formula trigger character at the start of a field.
    expect(csv).not.toMatch(/(^|,)"?=/m);

    await cleanupOrg(org.id);
  });

  it("only exports leads belonging to the caller's organization", async () => {
    const orgA = await createTestOrg("Export Org A");
    const orgB = await createTestOrg("Export Org B");
    await prisma.lead.create({ data: { organizationId: orgA.id, name: "Org A Lead" } });
    await prisma.lead.create({ data: { organizationId: orgB.id, name: "Org B Lead" } });

    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: orgA.id }));
    const res = await GET();
    const csv = await res.text();

    expect(csv).toContain("Org A Lead");
    expect(csv).not.toContain("Org B Lead");

    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });
});
