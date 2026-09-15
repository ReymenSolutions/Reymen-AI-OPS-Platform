// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("sendEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("falls back to logging and returns sent:false when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendEmail } = await import("./email");

    const result = await sendEmail({ to: "test@example.com", subject: "Hi", html: "<p>Hello</p>" });

    expect(result.sent).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("test@example.com"));
    logSpy.mockRestore();
  });

  it("sends via Resend when RESEND_API_KEY is set", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const sendMock = vi.fn().mockResolvedValue({ data: { id: "abc" }, error: null });
    vi.doMock("resend", () => ({
      Resend: class {
        emails = { send: sendMock };
      },
    }));

    const { sendEmail } = await import("./email");
    const result = await sendEmail({ to: "test@example.com", subject: "Hi", html: "<p>Hello</p>" });

    expect(result.sent).toBe(true);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "test@example.com", subject: "Hi" })
    );
  });

  it("returns sent:false (without throwing) when Resend reports an error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    const sendMock = vi.fn().mockResolvedValue({ data: null, error: { message: "bad request" } });
    vi.doMock("resend", () => ({
      Resend: class {
        emails = { send: sendMock };
      },
    }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { sendEmail } = await import("./email");
    const result = await sendEmail({ to: "test@example.com", subject: "Hi", html: "<p>Hello</p>" });

    expect(result.sent).toBe(false);
    errSpy.mockRestore();
  });
});
