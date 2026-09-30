// Pure module — importable from client and server contexts.
//
// Errores que se le muestran al usuario. En producción Next.js oculta el
// mensaje de cualquier error lanzado dentro de una acción de servidor (el
// usuario veía "Minified React error #441..." en vez de, p. ej., "Ya existe
// un usuario con ese email"), pero conserva el campo `digest` de un error si
// ya trae uno. UserError guarda ahí el mensaje para que llegue al navegador,
// y getErrorMessage() lo recupera (y lo traduce si la app está en inglés).

import { translateServerMessage } from "./server-messages";

const PREFIX = "reymen-user-error:";

export class UserError extends Error {
  digest: string;
  constructor(message: string) {
    super(message);
    this.name = "UserError";
    this.digest = PREFIX + encodeURIComponent(message);
  }
}

function currentLang(): "es" | "en" {
  if (typeof document === "undefined") return "es";
  return document.documentElement.lang === "en" ? "en" : "es";
}

/**
 * Texto para mostrar al usuario a partir de un error atrapado en el cliente.
 * Usa el mensaje de un UserError (aunque venga de producción), el mensaje de
 * un error normal solo si no es el genérico de React, y si no, `fallback`.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest.startsWith(PREFIX)) {
    try {
      return translateServerMessage(decodeURIComponent(digest.slice(PREFIX.length)), currentLang());
    } catch {
      // digest mal formado: seguir con el resto
    }
  }
  if (error instanceof Error && error.message && !/Minified React error|Server Components render|server-side exception/i.test(error.message)) {
    return translateServerMessage(error.message, currentLang());
  }
  return fallback;
}

/** Traduce un mensaje de validación (p. ej. el de un campo del formulario) al idioma actual. */
export function translateMessage(message: string | undefined): string {
  return message ? translateServerMessage(message, currentLang()) : "";
}
