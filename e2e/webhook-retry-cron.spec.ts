import { test, expect } from "@playwright/test";

test.describe("webhook retry cron endpoint", () => {
  test("is reachable without a session — never redirected to /login by middleware", async ({ request }) => {
    // Regression test: /api/cron/* must be excluded from the session-auth
    // middleware (like /api/webhooks/*), since it authenticates itself via
    // CRON_SECRET. Before the fix, an unauthenticated request here was
    // redirected to /login with a 200/307, masking the route's own 401.
    const res = await request.post("/api/cron/retry-webhooks", {
      headers: { authorization: "Bearer whatever-invalid-secret" },
      maxRedirects: 0,
    });

    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
