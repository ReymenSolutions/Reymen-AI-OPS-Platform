import { createHmac, timingSafeEqual } from "crypto";

/** Constant-time string comparison — never use `===` on secrets. */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  const expectedHeader = `sha256=${expected}`;

  return secretsMatch(signature, expectedHeader);
}

export function createWebhookSignature(payload: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

/**
 * In development, accepts either the full HMAC signature OR a plain
 * x-reymen-secret header matching N8N_WEBHOOK_SECRET.
 * In production, only the HMAC flow is accepted.
 */
export function isWebhookAuthorized(
  rawBody: string,
  hmacSignature: string,
  plainSecret: string,
  knownSecret: string
): boolean {
  if (verifyWebhookSignature(rawBody, hmacSignature, knownSecret)) return true;

  if (process.env.NODE_ENV !== "production" && knownSecret !== "" && secretsMatch(plainSecret, knownSecret)) {
    return true;
  }

  return false;
}
