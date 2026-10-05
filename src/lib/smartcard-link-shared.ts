// Pure module — importable from client and server contexts.
// Tipos y roles de la vinculación con SmartCard (ver smartcard-link.ts).

// Roles que Reymen asigna desde Admin → Clientes. "owner" sí se permite: el
// portal no lo deja invitar (actions/portal/smartcard.ts) porque lo asigna Reymen.
export const SMARTCARD_LINK_ROLES = ["owner", "admin", "manager", "staff", "agent"] as const;
export type SmartcardLinkRole = (typeof SMARTCARD_LINK_ROLES)[number];

export interface SmartcardCompanyOption {
  id: string;
  name: string;
  slug: string;
  /** ID al que apunta su external_org_id cuando no existe en Reymen (vínculo roto). */
  staleOrgId?: string | null;
}

/** Empresa de SmartCard ya vinculada a otro cliente de Reymen. */
export interface SmartcardTakenCompany {
  id: string;
  name: string;
  slug: string;
  clientId: string;
  clientName: string;
}

export type SmartcardCompanyLink =
  | { kind: "none" }
  | { kind: "client"; clientId: string; clientName: string }
  | { kind: "stale"; orgId: string };

export interface SmartcardCompanyRow {
  id: string;
  name: string;
  slug: string;
  link: SmartcardCompanyLink;
  activeMembers: number;
  cards: number;
}

export interface SmartcardLinkMember {
  id: string;
  email: string | null;
  roleCode: string;
  status: string;
}

export type SmartcardLinkState =
  | { status: "not_configured" }
  | { status: "error" }
  | { status: "unlinked"; candidates: SmartcardCompanyOption[]; taken: SmartcardTakenCompany[] }
  | { status: "linked"; company: SmartcardCompanyOption; members: SmartcardLinkMember[] };
