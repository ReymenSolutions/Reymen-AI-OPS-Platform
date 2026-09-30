// Pure module (Web Crypto only) — usable from the Node server and from the
// Edge middleware (proxy.ts).
//
// Cookie de impersonación firmado. Antes era JSON plano y la app confiaba en
// todo su contenido, incluido el rol del usuario objetivo: un ADMIN podía
// editar su propia cookie y "impersonar" a un SUPER_ADMIN, saltándose la
// regla de startImpersonation() que prohíbe impersonar administradores. Con
// la firma (HMAC-SHA256 con AUTH_SECRET) solo cuenta una cookie emitida por
// el servidor; cualquier cambio a mano la invalida.

export const IMPERSONATION_COOKIE = "reymen-impersonate";
export const IMPERSONATION_MAX_AGE = 60 * 60 * 8;

export interface ImpersonationPayload {
  adminId: string;
  adminName: string | null;
  adminEmail: string;
  targetUserId: string;
  targetName: string | null;
  targetEmail: string;
  targetImage: string | null;
  targetRole: string;
  targetOrgId: string;
}

function getSecret(): string | null {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Devuelve el valor firmado para guardar en la cookie. Falla si no hay AUTH_SECRET. */
export async function encodeImpersonationCookie(payload: ImpersonationPayload): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("AUTH_SECRET no está configurado");
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = toBase64Url(await hmac(secret, body));
  return `${body}.${sig}`;
}

/** Verifica la firma y devuelve el contenido, o null si falta, está alterada o tiene el formato viejo. */
export async function decodeImpersonationCookie(value: string | undefined | null): Promise<ImpersonationPayload | null> {
  const secret = getSecret();
  if (!value || !secret) return null;
  const [body, sig, extra] = value.split(".");
  if (!body || !sig || extra !== undefined) return null;
  try {
    const expected = await hmac(secret, body);
    if (!timingSafeEqual(expected, fromBase64Url(sig))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as ImpersonationPayload;
    return typeof payload?.adminId === "string" && typeof payload?.targetUserId === "string" ? payload : null;
  } catch {
    return null;
  }
}
