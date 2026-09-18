import { createHmac } from "crypto";
import { secretsMatch } from "./webhook-validator";

/**
 * Signed hand-off token for the SmartCard SSO bridge (module `NFC_QR`).
 *
 * `PlatformModule.NFC_QR` has existed in the schema since before this
 * feature with the comment "integration point for a separate future repo"
 * — that repo (`reymen-smartcard`, Supabase-based, a completely different
 * auth stack: NextAuth here vs. Supabase Auth there) already exists and
 * already has a working SmartCard product. Rather than rebuilding it here,
 * a click on "SmartCard" in the portal mints one of these tokens and
 * redirects to that other app's `/api/sso/smartcard`, which verifies it,
 * resolves the matching Supabase company, and signs the person in via a
 * Supabase Admin API magic link — no second password, no second signup.
 *
 * Deliberately NOT reusing `webhook-validator.ts`'s HMAC-over-raw-body
 * scheme as-is: this is a one-shot, single-use handoff (not a webhook
 * delivery that gets JSON-parsed after verification), so the payload
 * travels base64url-encoded inside the token itself instead of being
 * verified against a separately-transmitted body. `secretsMatch()` (the
 * constant-time comparator) is reused as-is — no reason to duplicate it.
 */

const TOKEN_TTL_MS = 60 * 1000; // single click, single use — 60s is generous

interface SmartcardSsoPayload {
  orgId: string;
  email: string;
  iat: number; // epoch ms
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string | null {
  try {
    return Buffer.from(input, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("hex");
}

/** Portal side: mint a token for the currently-authenticated org/user. */
export function createSmartcardSsoToken(orgId: string, email: string, secret: string): string {
  const payload: SmartcardSsoPayload = { orgId, email, iat: Date.now() };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

export type VerifySmartcardSsoResult =
  | { ok: true; orgId: string; email: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/**
 * `reymen-smartcard` side verifies with this same function (ported there —
 * the two repos don't share a package, so it's duplicated on purpose,
 * exactly like `secretsMatch`'s constant-time-compare pattern already is
 * conceptually duplicated across unrelated codebases; keeping the exported
 * surface tiny keeps the duplication cheap to keep in sync).
 */
export function verifySmartcardSsoToken(token: string, secret: string): VerifySmartcardSsoResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadB64, signature] = parts;

  const expected = sign(payloadB64, secret);
  if (!secretsMatch(signature, expected)) return { ok: false, reason: "bad_signature" };

  const decoded = base64UrlDecode(payloadB64);
  if (!decoded) return { ok: false, reason: "malformed" };

  let payload: SmartcardSsoPayload;
  try {
    payload = JSON.parse(decoded) as SmartcardSsoPayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!payload.orgId || !payload.email || typeof payload.iat !== "number") {
    return { ok: false, reason: "malformed" };
  }

  const age = Date.now() - payload.iat;
  if (age > TOKEN_TTL_MS || age < -30 * 1000) return { ok: false, reason: "expired" };

  return { ok: true, orgId: payload.orgId, email: payload.email };
}
