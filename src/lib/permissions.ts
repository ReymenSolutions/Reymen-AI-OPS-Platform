import type { UserRole } from "@prisma/client";

type Action =
  | "leads:create"
  | "leads:delete"
  | "leads:update_status"
  | "opportunities:create"
  | "opportunities:manage"
  | "pipeline:manage"
  | "automations:view"
  | "automations:manage"
  | "conversations:view"
  | "conversations:escalate"
  | "conversations:resolve"
  | "conversations:reply"
  | "conversations:assign"
  | "knowledge_base:manage"
  | "prompts:manage"
  | "team:manage"
  | "requests:create"
  | "reports:view"
  | "settings:view"
  | "settings:manage";

const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
  SUPER_ADMIN: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "prompts:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
  ],
  ADMIN: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "prompts:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
  ],
  OWNER: [
    "leads:create", "leads:delete", "leads:update_status",
    "opportunities:create", "opportunities:manage", "pipeline:manage",
    "automations:view", "automations:manage",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "prompts:manage", "team:manage",
    "requests:create", "reports:view", "settings:view", "settings:manage",
  ],
  MANAGER: [
    "leads:create", "leads:update_status",
    "opportunities:create", "opportunities:manage",
    "automations:view",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply", "conversations:assign",
    "knowledge_base:manage", "prompts:manage",
    "requests:create", "reports:view", "settings:view",
  ],
  AGENT: [
    "leads:create", "leads:update_status",
    "opportunities:create", "opportunities:manage",
    "automations:view",
    "conversations:view", "conversations:escalate", "conversations:resolve", "conversations:reply",
    "requests:create",
  ],
  VIEWER: [
    "leads:update_status",
    "automations:view",
    "conversations:view",
    "reports:view",
  ],
  CLIENT: [
    "leads:create",
    "requests:create",
    "reports:view",
    "settings:view",
  ],
};

export function can(role: UserRole, action: Action): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

export const PLAN_LIMITS: Record<string, { leads: number; users: number; automations: number; label: string }> = {
  starter:      { leads: 500,    users: 2,  automations: 3,  label: "Starter" },
  professional: { leads: 5000,   users: 10, automations: 15, label: "Professional" },
  enterprise:   { leads: 99999,  users: 99, automations: 99, label: "Enterprise" },
};

// Monthly subscription cost per plan, in USD. The single source of truth for
// what a client actually pays — used anywhere real cost needs to be compared
// against real revenue (e.g. ROI reporting), instead of each caller hardcoding
// its own price table.
export const PLAN_PRICES: Record<string, number> = {
  starter: 299,
  professional: 699,
  enterprise: 1499,
};
