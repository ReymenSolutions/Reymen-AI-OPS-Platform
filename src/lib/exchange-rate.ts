// ─── Tipo de cambio MXN/USD automático ───────────────────────────────
// Fuente, en orden:
//   1. Banxico (tipo de cambio FIX, serie SF43718) si BANXICO_TOKEN está
//      configurado — el oficial en México. El token es gratuito:
//      https://www.banxico.org.mx/SieAPIRest/service/v1/token
//   2. Frankfurter (datos del Banco Central Europeo), sin llave.
//   3. MXN_PER_USD del .env, solo como respaldo si ambas fallan.
// El valor se guarda en memoria unas horas: los reportes no necesitan el
// tipo de cambio al minuto y así no se consulta una API en cada carga.
// Si todo falla se devuelve null y quien lo usa lo avisa (ver roi.ts).

import { getMxnPerUsd } from "./currency";

export type ExchangeRateSource = "banxico" | "frankfurter" | "env";

export interface MxnPerUsdRate {
  rate: number;
  source: ExchangeRateSource;
  /** Fecha del dato según la fuente (YYYY-MM-DD), o null si viene del .env. */
  date: string | null;
}

const CACHE_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

let cache: { value: MxnPerUsdRate; at: number } | null = null;

/** Solo para pruebas. */
export function resetExchangeRateCache() {
  cache = null;
}

function validRate(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

async function fromBanxico(token: string): Promise<MxnPerUsdRate | null> {
  const res = await fetch(
    "https://www.banxico.org.mx/SieAPIRest/service/v1/series/SF43718/datos/oportuno",
    { headers: { "Bmx-Token": token, Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" }
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { bmx?: { series?: { datos?: { fecha?: string; dato?: string }[] }[] } };
  const point = body.bmx?.series?.[0]?.datos?.[0];
  const rate = Number(point?.dato?.replace(/,/g, ""));
  if (!validRate(rate)) return null;
  // Banxico manda la fecha como DD/MM/YYYY.
  const [d, m, y] = (point?.fecha ?? "").split("/");
  return { rate, source: "banxico", date: y && m && d ? `${y}-${m}-${d}` : null };
}

async function fromFrankfurter(): Promise<MxnPerUsdRate | null> {
  const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=MXN", {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { date?: string; rates?: { MXN?: number } };
  const rate = body.rates?.MXN;
  if (!validRate(rate)) return null;
  return { rate, source: "frankfurter", date: body.date ?? null };
}

export async function getMxnPerUsdRate(): Promise<MxnPerUsdRate | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const token = process.env.BANXICO_TOKEN?.trim();
  const providers: (() => Promise<MxnPerUsdRate | null>)[] = [];
  if (token) providers.push(() => fromBanxico(token));
  providers.push(fromFrankfurter);

  for (const provider of providers) {
    try {
      const value = await provider();
      if (value) {
        cache = { value, at: Date.now() };
        return value;
      }
    } catch (error) {
      console.error("[exchange-rate] no se pudo consultar la fuente:", error instanceof Error ? error.message : error);
    }
  }

  // Respaldo manual: no se guarda en caché, para volver a intentar la fuente
  // automática en la siguiente carga.
  const envRate = getMxnPerUsd();
  return envRate ? { rate: envRate, source: "env", date: null } : null;
}
