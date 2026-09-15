// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

describe("GET /api/health", () => {
  it("returns 200 with status ok when the database is reachable", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
  });

  it("returns 503 with status error when the database is unreachable", async () => {
    vi.resetModules();
    vi.doMock("@/lib/prisma", () => ({
      prisma: { $queryRaw: vi.fn().mockRejectedValue(new Error("connection refused")) },
    }));

    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.checks.database).toBe("error");
    expect(body.checks.error).toBe("connection refused");

    vi.doUnmock("@/lib/prisma");
    vi.resetModules();
  });
});
