// IP del cliente para el límite de intentos de login. Antes se tomaba el
// PRIMER valor de X-Forwarded-For, que lo manda el propio cliente: cambiándolo
// en cada intento se podía esquivar el límite por IP. Detrás del proxy
// (nginx-proxy en el VPS) los valores confiables son X-Real-IP, que el proxy
// sobrescribe, o el ÚLTIMO de X-Forwarded-For, que es el que agrega el proxy.
export function clientIp(request?: Request): string | null {
  const realIp = request?.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request?.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

/** Intentos de login permitidos por IP cada 10 minutos (LOGIN_IP_RATE_LIMIT, por defecto 20). */
export function loginIpRateLimit(): number {
  const n = Number(process.env.LOGIN_IP_RATE_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 20;
}
