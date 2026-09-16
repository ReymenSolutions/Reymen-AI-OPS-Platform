import { createHmac, timingSafeEqual } from "crypto";

/** Constant-time string comparison — never use `===` on secrets. */
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// A previously-valid HMAC signature (payload + secret) never expires on its
// own — anyone who captured one request (a proxy log, a misconfigured n8n
// execution log, a MITM before this was HTTPS-only) could replay it forever
// and it would still verify. Binding the signature to a timestamp the
// server itself bounds closes that: the signed message is `timestamp.body`,
// and a request outside the freshness window is rejected before the
// signature is even checked. 5 minutes generously covers normal clock drift
// and network latency without leaving a meaningfully exploitable window.
const REPLAY_WINDOW_MS = 5 * 60 * 1000;
// Small forward allowance for the sender's clock running slightly ahead of ours.
const CLOCK_SKEW_AHEAD_MS = 30 * 1000;

export function isTimestampFresh(timestamp: string): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  const age = Date.now() - ts;
  return age <= REPLAY_WINDOW_MS && age >= -CLOCK_SKEW_AHEAD_MS;
}

function signedMessage(timestamp: string, payload: string): string {
  return `${timestamp}.${payload}`;
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: string
): boolean {
  const expected = createHmac("sha256", secret)
    .update(signedMessage(timestamp, payload))
    .digest("hex");
  const expectedHeader = `sha256=${expected}`;

  return secretsMatch(signature, expectedHeader);
}

export function createWebhookSignature(payload: string, secret: string, timestamp: string): string {
  return `sha256=${createHmac("sha256", secret).update(signedMessage(timestamp, payload)).digest("hex")}`;
}

/**
 * In development, accepts either the full HMAC signature (bound to a fresh
 * timestamp) OR a plain x-reymen-secret header matching N8N_WEBHOOK_SECRET.
 * In production, only the HMAC flow is accepted.
 */
export function isWebhookAuthorized(
  rawBody: string,
  hmacSignature: string,
  plainSecret: string,
  knownSecret: string,
  timestamp: string
): boolean {
  if (isTimestampFresh(timestamp) && verifyWebhookSignature(rawBody, hmacSignature, knownSecret, timestamp)) {
    return true;
  }

  if (process.env.NODE_ENV !== "production" && knownSecret !== "" && secretsMatch(plainSecret, knownSecret)) {
    return true;
  }

  return false;
}
