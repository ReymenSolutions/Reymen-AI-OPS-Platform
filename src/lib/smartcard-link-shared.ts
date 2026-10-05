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
  | { status: "unlinked"; candidates: SmartcardCompanyOption[] }
  | { status: "linked"; company: SmartcardCompanyOption; members: SmartcardLinkMember[] };
