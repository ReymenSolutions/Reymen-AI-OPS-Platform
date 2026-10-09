import { getSmartcardAdminClient } from "./smartcard-supabase";
import { listSmartcardCompanies } from "./smartcard-link";
import type { SmartcardCompanyRow } from "./smartcard-link-shared";

/**
 * Datos de Admin → SmartCard → Resumen: contadores de cada entidad y las
 * empresas que necesitan atención (sin cliente de Reymen o con vínculo roto).
 * Solo cuentas (head count): no trae filas.
 */
export interface SmartcardOverview {
  companies: number;
  clients: number;
  cards: number;
  profiles: number;
  /** Eventos humanos (sin bots) de los últimos 30 días. */
  events30d: number;
  unlinked: SmartcardCompanyRow[];
  stale: SmartcardCompanyRow[];
}

const DAY_MS = 24 * 3600_000;

export async function getSmartcardOverview(now = new Date()): Promise<SmartcardOverview | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const count = async (build: () => PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const { count: n, error } = await build();
    if (error) console.error("[smartcard-overview] conteo falló:", error.message);
    return n ?? 0;
  };
  const head = { count: "exact", head: true } as const;
  const since = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  const [companies, clients, cards, profiles, events30d, companyRows] = await Promise.all([
    count(() => supabase.from("companies").select("id", head)),
    count(() => supabase.from("clients").select("id", head).is("deleted_at", null)),
    count(() => supabase.from("cards").select("id", head).is("deleted_at", null)),
    count(() => supabase.from("profiles").select("id", head).is("deleted_at", null)),
    count(() => supabase.from("events").select("id", head).eq("is_bot", false).gte("occurred_at", since)),
    listSmartcardCompanies(),
  ]);

  const rows = companyRows ?? [];
  return {
    companies,
    clients,
    cards,
    profiles,
    events30d,
    unlinked: rows.filter((c) => c.link.kind === "none"),
    stale: rows.filter((c) => c.link.kind === "stale"),
  };
}
