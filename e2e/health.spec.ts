import { test, expect } from "@playwright/test";

test.describe("health check endpoint", () => {
  test("is reachable without a session and reports the database as ok", async ({ request }) => {
    const res = await request.get("/api/health", { maxRedirects: 0 });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database).toBe("ok");
  });
});
