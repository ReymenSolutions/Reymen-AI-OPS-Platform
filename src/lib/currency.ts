// ─── Conversión de moneda para reportes ──────────────────────────────
// Los precios de los planes están en USD, pero las oportunidades se
// capturan en MXN o USD (Opportunity.currency). El tipo de cambio se toma
// automáticamente de una fuente externa (exchange-rate.ts); MXN_PER_USD
// (cuántos pesos vale 1 USD, p. ej. "18.25") queda solo como respaldo si
// esa fuente no responde. A propósito no hay un valor por defecto en el
// código: un tipo de cambio inventado haría pasar un número equivocado por
// real. Sin ninguno de los dos, los montos en MXN no se convierten y quien
// los muestre debe avisarlo.

export function getMxnPerUsd(): number | null {
  const raw = process.env.MXN_PER_USD?.trim();
  if (!raw) return null;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Convierte un monto a USD. Devuelve null si la moneda no se puede convertir (MXN sin tipo de cambio, u otra moneda). */
export function toUsd(amount: number, currency: string, mxnPerUsd: number | null): number | null {
  const code = currency.trim().toUpperCase();
  if (code === "USD") return amount;
  if (code === "MXN" && mxnPerUsd) return amount / mxnPerUsd;
  return null;
}
