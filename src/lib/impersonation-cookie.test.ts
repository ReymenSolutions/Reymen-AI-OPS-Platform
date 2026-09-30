// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { encodeImpersonationCookie, decodeImpersonationCookie, type ImpersonationPayload } from "./impersonation-cookie";

const payload: ImpersonationPayload = {
  adminId: "admin_1", adminName: "Admin", adminEmail: "a@x.mx",
  targetUserId: "user_1", targetName: "Dueña", targetEmail: "d@x.mx",
  targetImage: null, targetRole: "OWNER", targetOrgId: "org_1",
};

describe("impersonation cookie", () => {
  beforeEach(() => vi.stubEnv("AUTH_SECRET", "test-secret"));
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips a cookie the server signed", async () => {
    const value = await encodeImpersonationCookie(payload);
    expect(await decodeImpersonationCookie(value)).toEqual(payload);
  });

  it("CRITICAL: rejects a cookie edited by hand (e.g. raising targetRole to SUPER_ADMIN)", async () => {
    const value = await encodeImpersonationCookie(payload);
    const [, sig] = value.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ ...payload, targetRole: "SUPER_ADMIN" })).toString("base64url");
    expect(await decodeImpersonationCookie(`${forgedBody}.${sig}`)).toBeNull();
  });

  it("rejects the old unsigned JSON format", async () => {
    expect(await decodeImpersonationCookie(JSON.stringify(payload))).toBeNull();
  });

  it("rejects a cookie signed with a different secret", async () => {
    const value = await encodeImpersonationCookie(payload);
    vi.stubEnv("AUTH_SECRET", "other-secret");
    expect(await decodeImpersonationCookie(value)).toBeNull();
  });

  it("returns null for a missing cookie", async () => {
    expect(await decodeImpersonationCookie(undefined)).toBeNull();
  });
});
