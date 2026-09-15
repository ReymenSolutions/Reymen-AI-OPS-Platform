// Measures pure server-side render time (TTFB of the actual HTML document),
// with zero browser/JS overhead — isolates DB/render cost per route.
import fs from "fs";

const BASE = "http://localhost:3000";
const RUNS = 8;

const ADMIN_ROUTES = [
  ["/admin/dashboard", "Admin: Dashboard"],
  ["/admin/clients", "Admin: Clientes"],
  ["/admin/automations", "Admin: Automatizaciones"],
  ["/admin/escalations", "Admin: Escalaciones"],
  ["/admin/requests", "Admin: Solicitudes"],
  ["/admin/templates", "Admin: Templates"],
  ["/admin/metrics", "Admin: Métricas"],
  ["/admin/audit", "Admin: Auditoría"],
  ["/admin/webhooks", "Admin: Webhooks"],
  ["/admin/settings", "Admin: Configuración"],
];

const PORTAL_ROUTES = [
  ["/portal/dashboard", "Portal: Dashboard"],
  ["/portal/leads", "Portal: Leads"],
  ["/portal/automations", "Portal: Automatizaciones"],
  ["/portal/conversations", "Portal: Conversaciones"],
  ["/portal/knowledge-base", "Portal: Base de Conocimiento"],
  ["/portal/prompts", "Portal: Prompts"],
  ["/portal/appointments", "Portal: Citas"],
  ["/portal/reports", "Portal: Reportes"],
  ["/portal/requests", "Portal: Solicitudes"],
  ["/portal/templates", "Portal: Templates"],
  ["/portal/settings", "Portal: Configuración"],
  ["/portal/whatsapp", "Portal: WhatsApp"],
];

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

  const adminCookie = await getSessionCookie("admin@reymen.io", "admin123456");
  for (const [path, label] of ADMIN_ROUTES) {
    const timings = await measure(path, adminCookie);
    const s = stats(timings);
    results[label] = { path, ...s };
    console.log(`${label.padEnd(30)} avg=${s.avg}ms min=${s.min}ms max=${s.max}ms status=${s.status}`);
  }

  const portalCookie = await getSessionCookie("carlos@clinicasanrafael.com", "client123456");
  for (const [path, label] of PORTAL_ROUTES) {
    const timings = await measure(path, portalCookie);
    const s = stats(timings);
    results[label] = { path, ...s };
    console.log(`${label.padEnd(30)} avg=${s.avg}ms min=${s.min}ms max=${s.max}ms status=${s.status}`);
  }

  const outFile = process.argv[2] || "/tmp/perf-server-results.json";
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
