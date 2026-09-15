// Server-only TTFB measurement (same methodology as perf-server-only.mjs)
// against the realistic-scale seeded org (300 leads, 120 conversations, some
// with 150 messages) instead of the tiny demo dataset. Run
// scripts/seed-scale-test.mjs first. Point of this script: prove whether the
// pagination/select fixes actually matter at a volume where an unbounded
// query would have hurt.
import fs from "fs";

const BASE = "http://localhost:3000";
const RUNS = 8;

function mergeCookies(jar, setCookieHeaders) {
  for (const raw of setCookieHeaders) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function jarToHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function getSessionCookie(email, password) {
  const jar = new Map();

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  mergeCookies(jar, csrfRes.headers.getSetCookie());

  const body = new URLSearchParams({ email, password, csrfToken, redirect: "false", json: "true" });
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jarToHeader(jar) },
    body,
    redirect: "manual",
  });
  mergeCookies(jar, loginRes.headers.getSetCookie());

  if (!jarToHeader(jar).includes("session-token")) {
    throw new Error(`Login failed for ${email}: no session-token cookie set (status ${loginRes.status})`);
  }

  return jarToHeader(jar);
}

async function measure(path, cookie) {
  const timings = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    await res.text();
    const elapsed = performance.now() - start;
    if (i > 0) timings.push({ elapsed, status: res.status }); // discard first (connection warmup)
  }
  return timings;
}

function stats(timings) {
  const values = timings.map((t) => t.elapsed);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { avg: Math.round(avg), min: Math.round(Math.min(...values)), max: Math.round(Math.max(...values)), status: timings[0]?.status };
}

async function main() {
  const results = {};
  const longConversationId = process.argv[3];
  if (!longConversationId) {
    console.error("Usage: node perf-scale-test.mjs <out-file> <long-conversation-id>");
    process.exit(1);
  }

  const cookie = await getSessionCookie("scale@test.local", "ScaleTest123456");

  const ROUTES = [
    ["/portal/dashboard", "Portal: Dashboard"],
    ["/portal/leads", "Portal: Leads (300 leads, page 1)"],
    ["/portal/leads?page=2", "Portal: Leads (page 2)"],
    ["/portal/leads?q=Prueba+250", "Portal: Leads (search, off-page result)"],
    ["/portal/conversations", "Portal: Conversaciones (120 convs, page 1)"],
    ["/portal/conversations?page=2", "Portal: Conversaciones (page 2)"],
    [`/portal/conversations/${longConversationId}`, "Portal: Conversación larga (150 msgs)"],
  ];

  for (const [path, label] of ROUTES) {
    const timings = await measure(path, cookie);
    const s = stats(timings);
    results[label] = { path, ...s };
    console.log(`${label.padEnd(45)} avg=${s.avg}ms min=${s.min}ms max=${s.max}ms status=${s.status}`);
  }

  const outFile = process.argv[2] || "/tmp/perf-scale-results.json";
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
