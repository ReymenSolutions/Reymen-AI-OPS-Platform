// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const retryAllFailedWebhookEvents = vi.fn();
vi.mock("@/lib/webhook-retry", () => ({
  retryAllFailedWebhookEvents: (...args: unknown[]) => retryAllFailedWebhookEvents(...args),
}));

const { POST } = await import("./route");

function makeRequest(authHeader?: string): NextRequest {
  return new NextRequest("http://localhost/api/cron/retry-webhooks", {
    method: "POST",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe("POST /api/cron/retry-webhooks", () => {
  beforeEach(() => {
    retryAllFailedWebhookEvents.mockReset();
  });

  it("rejects with 401 when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(makeRequest("Bearer whatever"));
    expect(res.status).toBe(401);
    expect(retryAllFailedWebhookEvents).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("rejects with 401 when the bearer token doesn't match CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    const res = await POST(makeRequest("Bearer wrong-secret"));
    expect(res.status).toBe(401);
    expect(retryAllFailedWebhookEvents).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("rejects with 401 when no authorization header is sent", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("retries failed events and returns the summary when authorized", async () => {
    vi.stubEnv("CRON_SECRET", "correct-secret");
    retryAllFailedWebhookEvents.mockResolvedValue({ retried: 3, succeeded: 2 });

    const res = await POST(makeRequest("Bearer correct-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, retried: 3, succeeded: 2 });
    vi.unstubAllEnvs();
  });
});
