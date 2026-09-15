import { prisma } from "@/lib/prisma";

export interface RateLimitOptions {
  /** Max attempts allowed inside the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Present only when allowed is false. */
  retryAfterSeconds?: number;
}

/**
 * DB-backed sliding-window rate limiter — holds up across multiple
 * serverless instances/processes without needing Redis, at the cost of
 * one extra round trip to Postgres per check. Fine for auth and webhook
 * endpoints, which are already far from hot paths.
 *
 * Records a hit and returns whether this call should be allowed to
 * proceed. Callers should call this BEFORE doing the sensitive work.
 */
export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - opts.windowMs);

  // Best-effort cleanup so the table doesn't grow unbounded; failures here
  // must never block the actual rate-limit decision.
  prisma.rateLimitHit.deleteMany({ where: { key, createdAt: { lt: windowStart } } }).catch(() => {});

  const recentHits = await prisma.rateLimitHit.findMany({
    where: { key, createdAt: { gte: windowStart } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (recentHits.length >= opts.limit) {
    const oldest = recentHits[0].createdAt;
    const retryAfterMs = oldest.getTime() + opts.windowMs - Date.now();
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  await prisma.rateLimitHit.create({ data: { key } });
  return { allowed: true };
}
