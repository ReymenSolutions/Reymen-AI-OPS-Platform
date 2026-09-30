// ─── URL pública de la app ───────────────────────────────────────────
// Única fuente para armar enlaces absolutos (correos, Stripe, avisos a
// admins). Antes cada llamador repetía
// `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"`, y en
// producción una variable faltante mandaba enlaces a localhost sin ningún
// aviso.
//
// Se lee con un nombre dinámico a propósito: Next.js sustituye
// `process.env.NEXT_PUBLIC_*` escrito literal por su valor AL CONSTRUIR la
// imagen, así que cambiar la variable en el .env del servidor no tendría
// efecto hasta reconstruir. Así se toma el valor con el que arranca el
// contenedor. Solo se usa en código de servidor.

const APP_URL_VAR = "NEXT_PUBLIC_APP_URL";
const DEV_FALLBACK = "http://localhost:3000";

let warned = false;

export function getAppUrl(): string {
  const configured = process.env[APP_URL_VAR]?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  if (process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.error(`[app-url] ${APP_URL_VAR} no está configurado: los enlaces de correos y avisos apuntarán a ${DEV_FALLBACK}.`);
  }
  return DEV_FALLBACK;
}

/** Enlace absoluto a una ruta de la app, p. ej. appUrl("/login"). */
export function appUrl(path: string): string {
  return `${getAppUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
