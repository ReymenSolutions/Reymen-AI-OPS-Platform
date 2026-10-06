import { getSmartcardAdminClient } from "./smartcard-supabase";

/**
 * Acceso de SUPERADMIN/ADMIN a las entidades de SmartCard (clients, cards,
 * profiles) que viven en el Supabase de reymen-smartcard — a diferencia de
 * smartcard-company.ts (acotado a una sola company, lo que ve un
 * company_user en /portal/smartcard), este archivo es cross-tenant: lista y
 * modifica CUALQUIER cliente/tarjeta/perfil, exactamente lo que hoy solo se
 * podía hacer desde admin.reymen.mx (apps/admin/app/clients). Cada función
 * de escritura debe ser llamada solo detrás de requireAdmin() — el cliente
 * Supabase es service-role, sin RLS, no hay red de seguridad de base de
 * datos aquí.
 *
 * `clients` es la entidad "negocio" de la que cuelgan cards/profiles
 * (client_id) — distinta de `companies` (la capa multi-tenant de
 * REYMEN_OPS_PLAN.md, a la que ya se liga cada Organization de Reymen vía
 * smartcard-link.ts/external_org_id). clients.company_id es el puente entre
 * ambas, opcional: un cliente simple (solo redirección, sin autoservicio)
 * puede no tener company_id nunca.
 */

function sanitizeSearchTerm(raw: string): string {
  // Paréntesis/comas rompen la sintaxis del filtro .or() de PostgREST si
  // van literales dentro del término — se quitan en vez de escaparse, un
  // buscador de nombre/negocio/correo no necesita soportarlos.
  return raw.replace(/[,()%]/g, "").trim();
}

export interface SmartcardClientRow {
  id: string;
  name: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE";
  companyId: string | null;
  companyName: string | null;
  createdAt: string;
}

export async function listSmartcardClients(search?: string): Promise<SmartcardClientRow[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  let query = supabase
    .from("clients")
    .select("id, name, business_name, email, phone, status, company_id, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const term = search ? sanitizeSearchTerm(search) : "";
  if (term) {
    query = query.or(`name.ilike.%${term}%,business_name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[smartcard-admin] Error listando clients:", error.message);
    return null;
  }
  if (!data?.length) return [];

  const companyIds = [...new Set(data.map((c) => c.company_id as string | null).filter((v): v is string => !!v))];
  const companyNameById = new Map<string, string>();
  if (companyIds.length) {
    const { data: companies } = await supabase.from("companies").select("id, name").in("id", companyIds);
    for (const c of companies ?? []) companyNameById.set(c.id as string, c.name as string);
  }

  return data.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    businessName: c.business_name as string | null,
    email: c.email as string | null,
    phone: c.phone as string | null,
    status: c.status as "ACTIVE" | "INACTIVE",
    companyId: c.company_id as string | null,
    companyName: c.company_id ? (companyNameById.get(c.company_id as string) ?? null) : null,
    createdAt: c.created_at as string,
  }));
}

export interface SmartcardClientDetail {
  id: string;
  name: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  companyId: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export async function getSmartcardClient(id: string): Promise<SmartcardClientDetail | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("clients")
    .select("id, name, business_name, email, phone, notes, status, company_id, deleted_at, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[smartcard-admin] Error buscando client:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id as string,
    name: data.name as string,
    businessName: data.business_name as string | null,
    email: data.email as string | null,
    phone: data.phone as string | null,
    notes: data.notes as string | null,
    status: data.status as "ACTIVE" | "INACTIVE",
    companyId: data.company_id as string | null,
    deletedAt: data.deleted_at as string | null,
    createdAt: data.created_at as string,
  };
}

export interface SmartcardCompanyOption {
  id: string;
  name: string;
  /** id del cliente que YA tiene esta company ligada (clients.company_id), si alguno. */
  linkedClientId: string | null;
}

/**
 * Catálogo de companies para el selector "Empresa (multi-tenant)" del
 * formulario de cliente — incluye a cuál cliente ya está ligada cada una
 * (si alguno) para que el formulario pueda avisar/bloquear un doble enlace,
 * mismo criterio que linkSmartcardCompany en smartcard-link.ts usa para el
 * enlace Organization-companies (nunca quitársela a otro sin querer).
 */
export async function listSmartcardCompanyOptions(): Promise<SmartcardCompanyOption[] | null> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return null;

  const [{ data: companies, error }, { data: clients }] = await Promise.all([
    supabase.from("companies").select("id, name").order("name", { ascending: true }),
    supabase.from("clients").select("id, company_id").is("deleted_at", null).not("company_id", "is", null),
  ]);
  if (error) {
    console.error("[smartcard-admin] Error listando companies:", error.message);
    return null;
  }

  const clientIdByCompanyId = new Map((clients ?? []).map((c) => [c.company_id as string, c.id as string]));
  return (companies ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    linkedClientId: clientIdByCompanyId.get(c.id as string) ?? null,
  }));
}

export interface SmartcardClientInput {
  name: string;
  businessName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "ACTIVE" | "INACTIVE";
  companyId: string | null;
}

export type SmartcardAdminResult<T = { id: string }> = { ok: true; data: T } | { ok: false; error: string };

export async function createSmartcardClient(input: SmartcardClientInput): Promise<SmartcardAdminResult> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "El nombre es obligatorio." };

  if (input.companyId) {
    const taken = await isCompanyAlreadyLinked(supabase, input.companyId, null);
    if (taken) return { ok: false, error: "Esa empresa ya está ligada a otro cliente." };
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name,
      business_name: input.businessName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      status: input.status,
      company_id: input.companyId || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[smartcard-admin] Error creando client:", error?.message);
    return { ok: false, error: "No se pudo guardar el cliente. Intenta de nuevo." };
  }
  return { ok: true, data: { id: data.id as string } };
}

export async function updateSmartcardClient(
  id: string,
  input: SmartcardClientInput
): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "El nombre es obligatorio." };

  if (input.companyId) {
    const taken = await isCompanyAlreadyLinked(supabase, input.companyId, id);
    if (taken) return { ok: false, error: "Esa empresa ya está ligada a otro cliente." };
  }

  const { error } = await supabase
    .from("clients")
    .update({
      name,
      business_name: input.businessName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      status: input.status,
      company_id: input.companyId || null,
    })
    .eq("id", id);

  if (error) {
    console.error("[smartcard-admin] Error actualizando client:", error.message);
    return { ok: false, error: "No se pudo guardar el cliente. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

async function isCompanyAlreadyLinked(
  supabase: ReturnType<typeof getSmartcardAdminClient>,
  companyId: string,
  exceptClientId: string | null
): Promise<boolean> {
  if (!supabase) return false;
  let query = supabase.from("clients").select("id").eq("company_id", companyId).is("deleted_at", null);
  if (exceptClientId) query = query.neq("id", exceptClientId);
  const { data } = await query.maybeSingle();
  return !!data;
}

export async function softDeleteSmartcardClient(id: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("clients").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("[smartcard-admin] Error dando de baja client:", error.message);
    return { ok: false, error: "No se pudo dar de baja al cliente. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}

export interface ClientProfileSummary {
  id: string;
  slug: string;
  displayName: string;
  status: string;
}

export interface ClientCardSummary {
  id: string;
  cardCode: string;
  destinationType: string;
  status: string;
}

/** Perfiles/tarjetas de un cliente, para la vista embebida en su detalle
 * (mismo patrón de solo-lectura-hasta-que-exista-su-propia-pantalla que
 * admin.reymen.mx's apps/admin/app/clients/[id]/page.tsx ya usaba). */
export async function listClientProfiles(clientId: string): Promise<ClientProfileSummary[]> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, slug, display_name, status")
    .eq("client_id", clientId)
    .is("deleted_at", null);
  if (error) {
    console.error("[smartcard-admin] Error listando profiles del cliente:", error.message);
    return [];
  }
  return (data ?? []).map((p) => ({
    id: p.id as string,
    slug: p.slug as string,
    displayName: p.display_name as string,
    status: p.status as string,
  }));
}

export async function listClientCards(clientId: string): Promise<ClientCardSummary[]> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("cards")
    .select("id, card_code, destination_type, status")
    .eq("client_id", clientId)
    .is("deleted_at", null);
  if (error) {
    console.error("[smartcard-admin] Error listando cards del cliente:", error.message);
    return [];
  }
  return (data ?? []).map((c) => ({
    id: c.id as string,
    cardCode: c.card_code as string,
    destinationType: c.destination_type as string,
    status: c.status as string,
  }));
}

export async function reactivateSmartcardClient(id: string): Promise<SmartcardAdminResult<null>> {
  const supabase = getSmartcardAdminClient();
  if (!supabase) return { ok: false, error: "SmartCard aún no está configurado en este entorno." };
  const { error } = await supabase.from("clients").update({ deleted_at: null }).eq("id", id);
  if (error) {
    console.error("[smartcard-admin] Error reactivando client:", error.message);
    return { ok: false, error: "No se pudo reactivar al cliente. Intenta de nuevo." };
  }
  return { ok: true, data: null };
}
