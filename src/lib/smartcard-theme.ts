/**
 * Contraste WCAG entre dos colores — portado de reymen-smartcard
 * (packages/lib/src/contrast.ts) para el editor de "tema básico" del
 * perfil digital self-service (primary_color/accent_color sobre
 * profiles.theme_overrides). Misma fórmula, misma razón para no usar un
 * atajo más simple (una comparación ingenua de brillo da falsos
 * positivos/negativos en varios pares de colores reales): luminancia
 * relativa y razón de contraste tal como las define WCAG 2.x
 * (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
 *
 * No se importa el paquete original porque reymen-smartcard es un
 * monorepo aparte (no publicado) — mismo criterio ya usado por
 * smartcard-company.ts para el resto de esta integración (portar la
 * lógica, no importarla).
 */

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * Razón de contraste entre dos colores `#RRGGBB`, de 1 (idénticos) a 21
 * (negro sobre blanco). `null` si algún color no es un hex válido.
 */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return null;

  const lumA = relativeLuminance(rgbA);
  const lumB = relativeLuminance(rgbB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Umbral AA de WCAG: 4.5:1 para texto normal, 3:1 para texto grande/íconos.
 * Un color inválido no reprueba aquí — el formulario ya rechaza eso aparte
 * (HEX_COLOR), este chequeo es solo la advertencia de legibilidad.
 */
export function passesWcagAA(hexA: string, hexB: string, largeOrIcon = false): boolean {
  const ratio = contrastRatio(hexA, hexB);
  if (ratio === null) return true;
  return ratio >= (largeOrIcon ? 3 : 4.5);
}
