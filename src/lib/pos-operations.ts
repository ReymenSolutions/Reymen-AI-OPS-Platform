import { createHmac } from "node:crypto";
import type { PosSnapshot } from "./pos-operations-summary";

// Lee en vivo el servidor de Reymen POS para Food → Operación. Servidor a
// servidor, firmado con la llave de conexión de la organización
// (n8nWebhookSecret) -- la misma con la que el POS firma las ventas que nos
// manda, así que no hay que configurar otro secreto. Contrato en el repo
// del POS: docs/integration.md, "Centro de operaciones".
//
//   REYMEN_POS_URL  URL pública del servidor del POS. Por omisión
//                   https://pos.reymen.mx (el único que existe hoy).

const DEFAULT_POS_URL = "https://pos.reymen.mx";
const TIMEOUT_MS = 6000;

export type PosSnapshotResult =
  | { kind: "ok"; snapshot: PosSnapshot }
  /** El POS no conoce a esta organización o la llave no coincide. */
  | { kind: "unauthorized" }
  | { kind: "unreachable"; detail: string };

export function posServerUrl(): string {
  return (process.env.REYMEN_POS_URL || DEFAULT_POS_URL).replace(/\/+$/, "");
}

export function posOpsSignature(secret: string, orgId: string, timestamp: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${orgId}.ops-snapshot`).digest("hex");
}

export async function fetchPosSnapshot(orgId: string, secret: string): Promise<PosSnapshotResult> {
  const ts = String(Date.now());
  let res: Response;
  try {
    res = await fetch(`${posServerUrl()}/api/ops/snapshot`, {
      headers: {
        "x-reymen-orgid": orgId,
        "x-reymen-timestamp": ts,
        "x-reymen-signature": `sha256=${posOpsSignature(secret, orgId, ts)}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { kind: "unreachable", detail: e instanceof Error ? e.message : String(e) };
  }
  if (res.status === 401) return { kind: "unauthorized" };
  if (!res.ok) return { kind: "unreachable", detail: `HTTP ${res.status}` };
  const body = (await res.json().catch(() => null)) as PosSnapshot | null;
  if (!body?.floor || !Array.isArray(body.devices) || !Array.isArray(body.floor.orders)) {
    return { kind: "unreachable", detail: "respuesta inválida" };
  }
  return { kind: "ok", snapshot: body };
}
