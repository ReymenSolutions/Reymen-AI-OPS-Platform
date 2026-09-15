// Measures CLIENT-SIDE (soft) navigation — clicking a sidebar link, which is
// what actually happens when a logged-in user switches between modules.
// Next.js App Router does a partial RSC fetch + client-side render, not a
// full page reload, so this is a very different (and more representative)
// number than a hard page.goto() reload.
import { chromium } from "playwright";
import fs from "fs";

const BASE = "http://localhost:3000";
const RUNS = 6;

const ADMIN_ROUTES = [
  ["/admin/dashboard", "Admin: Dashboard"],
  ["/admin/clients", "Admin: Clientes"],
  ["/admin/automations", "Admin: Automatizaciones"],
  ["/admin/templates", "Admin: Templates"],
  ["/admin/metrics", "Admin: Métricas"],
  ["/admin/webhooks", "Admin: Webhooks"],
  ["/admin/settings", "Admin: Configuración"],
];

const PORTAL_ROUTES = [
  ["/portal/dashboard", "Portal: Dashboard"],
  ["/portal/leads", "Portal: Leads"],
  ["/portal/automations", "Portal: Automatizaciones"],
  ["/portal/reports", "Portal: Reportes"],
  ["/portal/templates", "Portal: Templates"],
  ["/portal/whatsapp", "Portal: WhatsApp"],
];

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  await page.waitForTimeout(500);
}

async function measureSoftNav(page, path) {
  const timings = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    // Click the sidebar Link for this path — a real client-side transition,
    // not page.goto(). waitForURL resolves as soon as the client-side router
    // commits the new route (App Router's RSC-based navigation).
    await page.click(`a[href="${path}"]`);
    await page.waitForURL((u) => u.pathname === path, { timeout: 10000 });
    // Wait for the main content region to have settled (no more pending RSC stream)
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    const elapsed = performance.now() - start;
    if (i > 0) timings.push(elapsed); // discard first (prefetch cache warmup)
  }
  return timings;
}

function stats(values) {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { avg: Math.round(avg), min: Math.round(Math.min(...values)), max: Math.round(Math.max(...values)) };
}

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const results = {};

  {
    const page = await browser.newPage();
    await login(page, "admin@reymen.io", "admin123456");
    // Start from a route not in the measured list so the first measured click is a real nav
    await page.goto(`${BASE}/admin/escalations`, { waitUntil: "networkidle" });
    for (const [path, label] of ADMIN_ROUTES) {
      const timings = await measureSoftNav(page, path);
      results[label] = stats(timings);
      console.log(`${label.padEnd(30)} soft-nav avg=${results[label].avg}ms min=${results[label].min}ms max=${results[label].max}ms`);
    }
    await page.close();
  }

  {
    const page = await browser.newPage();
    await login(page, "carlos@clinicasanrafael.com", "client123456");
    await page.goto(`${BASE}/portal/conversations`, { waitUntil: "networkidle" });
    for (const [path, label] of PORTAL_ROUTES) {
      const timings = await measureSoftNav(page, path);
      results[label] = stats(timings);
      console.log(`${label.padEnd(30)} soft-nav avg=${results[label].avg}ms min=${results[label].min}ms max=${results[label].max}ms`);
    }
    await page.close();
  }

  await browser.close();
  const outFile = process.argv[2] || "/tmp/perf-softnav.json";
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
