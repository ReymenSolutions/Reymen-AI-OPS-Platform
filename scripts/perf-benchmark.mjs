import { chromium } from "playwright";
import fs from "fs";

const BASE = "http://localhost:3000";
const RUNS = 5; // per route, first run discarded as warmup

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

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  await page.waitForTimeout(300);
}

async function measureRoute(page, path) {
  const timings = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    const response = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
    const elapsed = performance.now() - start;
    const status = response?.status() ?? 0;

    // Also capture server-reported timing via the Server-Timing / navigation API
    const navTiming = await page.evaluate(() => {
      const [nav] = performance.getEntriesByType("navigation");
      if (!nav) return null;
      return {
        ttfb: nav.responseStart - nav.requestStart,
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        loadEvent: nav.loadEventEnd - nav.startTime,
      };
    });

    if (i > 0) timings.push({ elapsed, status, ...navTiming }); // discard first (cold/compile) run
  }
  return timings;
}

function stats(timings, key) {
  const values = timings.map((t) => t[key]).filter((v) => typeof v === "number" && !isNaN(v));
  if (values.length === 0) return { avg: null, min: null, max: null };
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { avg: Math.round(avg), min: Math.round(Math.min(...values)), max: Math.round(Math.max(...values)) };
}

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const results = {};

  // ── Admin session ──
  {
    const page = await browser.newPage();
    await login(page, "admin@reymen.io", "admin123456");
    for (const [path, label] of ADMIN_ROUTES) {
      const timings = await measureRoute(page, path);
      results[label] = {
        path,
        elapsed: stats(timings, "elapsed"),
        ttfb: stats(timings, "ttfb"),
        domContentLoaded: stats(timings, "domContentLoaded"),
        status: timings[0]?.status,
      };
      console.log(`${label.padEnd(30)} elapsed avg=${results[label].elapsed.avg}ms ttfb avg=${results[label].ttfb.avg}ms`);
    }
    await page.close();
  }

  // ── Portal session ──
  {
    const page = await browser.newPage();
    await login(page, "carlos@clinicasanrafael.com", "client123456");
    for (const [path, label] of PORTAL_ROUTES) {
      const timings = await measureRoute(page, path);
      results[label] = {
        path,
        elapsed: stats(timings, "elapsed"),
        ttfb: stats(timings, "ttfb"),
        domContentLoaded: stats(timings, "domContentLoaded"),
        status: timings[0]?.status,
      };
      console.log(`${label.padEnd(30)} elapsed avg=${results[label].elapsed.avg}ms ttfb avg=${results[label].ttfb.avg}ms`);
    }
    await page.close();
  }

  await browser.close();

  const outFile = process.argv[2] || "/tmp/perf-results.json";
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
