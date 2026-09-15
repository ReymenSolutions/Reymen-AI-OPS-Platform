# Reymen AI OPS Platform — Technical Documentation

> **Document Version:** 1.0 | **Date:** May 2026  
> **Language:** English/Spanish (technical terms in English, explanations bilingual)  
> **Audience:** Developers, DevOps, and technical team members

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Database Schema](#4-database-schema)
5. [Authentication & RBAC](#5-authentication--rbac)
6. [Multi-tenancy](#6-multi-tenancy)
7. [n8n Integration](#7-n8n-integration)
8. [Webhook Security](#8-webhook-security)
9. [API Reference](#9-api-reference)
10. [Server Actions](#10-server-actions)
11. [Template Engine](#11-template-engine)
12. [Audit System](#12-audit-system)
13. [Environment Variables](#13-environment-variables)
14. [Local Development Setup](#14-local-development-setup)
15. [Docker Deployment](#15-docker-deployment)
16. [Directory Structure](#16-directory-structure)
17. [Key Patterns](#17-key-patterns)
18. [Extending the Platform](#18-extending-the-platform)

---

## 1. Platform Overview

**Reymen AI OPS Platform** is a multi-tenant SaaS application that provides AI-powered business operations automation for SMBs. It combines a CRM, WhatsApp AI assistant, knowledge base management, and automated workflow execution through a unified portal.

### What it is

- A **Next.js 15** web application with App Router serving both a client-facing portal and an internal admin panel.
- A **multi-tenant CRM** where each tenant (organization) has isolated data, leads, automations, and settings.
- A **bidirectional integration layer** between the portal and **n8n** (the open-source workflow automation engine).

### Who it's for

| Persona | Description |
|---------|-------------|
| **End clients** | Business owners and their teams (clinics, real estate agencies, gyms, law firms, workshops, e-commerce stores) who access the portal to manage their operations |
| **Reymen admins** | Internal team members who manage client accounts, publish automation templates, and monitor the platform |

### The n8n Invisibility Principle

A core architectural decision is that **clients never see n8n**. The n8n URL, workflow IDs, webhook secrets, and all technical integration details are invisible to the portal user. From a client's perspective, automations simply "work." The platform exposes only business-level status (ACTIVE, ERROR, event history) and hides all infrastructure details. This reduces complexity for clients and allows Reymen to swap or upgrade the automation engine without affecting the user experience.

---

## 2. Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │    Nginx    │  Port 80/443 (TLS termination)
                    │  (reverse   │
                    │   proxy)    │
                    └──────┬──────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
  ┌──────▼──────┐                    ┌───────▼──────┐
  │  Next.js 15 │                    │     n8n      │
  │  App Router │   Internal HTTP    │  (workflow   │
  │  (Port 3000)│◄──────────────────►│   engine)   │
  │             │   webhooks         │  (Port 5678) │
  └──────┬──────┘                    └──────────────┘
         │
  ┌──────▼──────┐
  │ PostgreSQL  │
  │    16       │
  │ (Port 5432) │
  └─────────────┘
```

### Route Groups

The Next.js application uses App Router route groups to separate concerns:

| Route Group | Path Pattern | Who accesses |
|-------------|-------------|--------------|
| `(auth)` | `/login`, `/forgot-password` | Anyone (public) |
| `(portal)` | `/portal/*` | Authenticated clients (OWNER, MANAGER, AGENT, VIEWER, CLIENT) |
| `(admin)` | `/admin/*` | Reymen staff only (SUPER_ADMIN, ADMIN) |

### API Routes

| Pattern | Description |
|---------|-------------|
| `/api/auth/[...nextauth]` | NextAuth.js authentication handlers |
| `/api/webhooks/n8n/*` | Inbound webhooks from n8n (public, HMAC-protected) |
| `/api/v1/knowledge-base` | Knowledge base query endpoint (dual-auth) |
| `/api/portal/leads/export` | CSV export for portal users |

### Multi-Tenant Isolation Model

Every database query in the portal is scoped by `organizationId` extracted from the JWT session. There are no cross-tenant data leaks because:

1. The `organizationId` comes from the server-side session, never from user-supplied query parameters.
2. All Prisma queries include `where: { organizationId: session.user.organizationId }`.
3. The `assertOrgAccess()` utility in `src/lib/tenant.ts` provides an explicit guard for edge cases.

---

## 3. Tech Stack

### Full dependency list with versions

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^15.3.2 | React framework with App Router, Server Actions, and Server Components |
| `react` / `react-dom` | ^19.0.0 | UI rendering library |
| `next-auth` | ^5.0.0-beta.25 | Authentication (NextAuth v5 / Auth.js) |
| `@auth/prisma-adapter` | ^2.7.4 | Connects NextAuth sessions to Prisma |
| `@prisma/client` | ^6.8.2 | Type-safe database ORM client |
| `prisma` | ^6.8.2 | Database ORM and migration tooling |
| `bcryptjs` | ^3.0.2 | Password hashing |
| `zod` | ^3.25.32 | Runtime schema validation |
| `react-hook-form` | ^7.56.4 | Performant form state management |
| `@hookform/resolvers` | ^5.0.1 | Zod adapter for react-hook-form |
| `recharts` | ^2.15.3 | Chart library for dashboards and reports |
| `sonner` | ^2.0.5 | Toast notifications |
| `zustand` | ^5.0.3 | Client-side state management |
| `@tanstack/react-query` | ^5.80.1 | Server state caching and synchronization |
| `date-fns` | ^4.1.0 | Date formatting and manipulation |
| `lucide-react` | ^0.511.0 | Icon library |
| `tailwindcss` | ^4.1.8 | Utility-first CSS framework |
| `clsx` | ^2.1.1 | Conditional class name utility |
| `tailwind-merge` | ^3.3.0 | Tailwind class deduplication |
| `class-variance-authority` | ^0.7.1 | Component variant system |
| `@radix-ui/*` | ^1.x – ^2.x | Headless accessible UI primitives (Dialog, Select, Switch, Tabs, etc.) |
| `typescript` | ^5.8.3 | Type checking |
| `tsx` | ^4.19.4 | TypeScript execution for scripts (seed) |

### Runtime Environment

- **Node.js:** 20+ (22 in Docker)
- **Database:** PostgreSQL 16 (Alpine in Docker)
- **Workflow Engine:** n8n (latest, self-hosted)

---

## 4. Database Schema

### Schema file location

`prisma/schema.prisma` — provider: `postgresql`, ORM: `prisma-client-js`

---

### Model: Organization

The root tenant entity. Every piece of data in the system belongs to an Organization.

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique           // URL-safe identifier
  industry  String?                    // clinic | real_estate | gym | legal | workshop | ecommerce
  logoUrl   String?
  isActive  Boolean  @default(true)   // soft-disable entire tenant
  plan      String   @default("starter") // starter | professional | enterprise
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Relationships:** has many Users, Leads, Automations, Conversations, Appointments, Requests, Metrics, AuditLogs, WebhookEvents, KnowledgeBase entries, Prompts, TemplateInstallations; has one WhatsAppAssistant.

---

### Model: User

Platform user. Can be a Reymen admin (no organizationId) or a client team member (has organizationId).

```prisma
model User {
  id             String   @id @default(cuid())
  email          String   @unique
  name           String?
  passwordHash   String?
  role           UserRole @default(CLIENT)
  organizationId String?
  isActive       Boolean  @default(true)
}
```

**Key indexes:** `[organizationId]`, `[email]`

**Related models:** Account, Session (NextAuth standard models)

---

### Enum: UserRole

```prisma
enum UserRole {
  SUPER_ADMIN  // Reymen platform superadmin
  ADMIN        // Reymen internal admin
  OWNER        // Client organization owner
  MANAGER      // Client team manager
  AGENT        // Client sales/support agent
  VIEWER       // Read-only client user
  CLIENT       // Legacy / minimal-access client role
}
```

---

### Model: Lead

CRM prospect record. Scoped to an Organization with soft-delete support.

```prisma
model Lead {
  id             String     @id @default(cuid())
  organizationId String
  name           String
  email          String?
  phone          String?
  source         String?    // whatsapp | web | referral | manual | n8n
  status         LeadStatus @default(NEW)
  score          Int?       // 0-100, set by AI via webhook
  scoreReason    String?    // Human-readable explanation of AI score
  notes          String?
  metadata       Json?      // Arbitrary extra data from n8n
  assignedTo     String?    // User ID of assigned agent
  deletedAt      DateTime?  // Soft-delete timestamp
}
```

**Key indexes:** `[organizationId]`, `[organizationId, status]`, `[organizationId, createdAt]`

---

### Enum: LeadStatus

```prisma
enum LeadStatus {
  NEW         // Just captured
  CONTACTED   // First contact made
  QUALIFIED   // Meets ideal customer profile
  PROPOSAL    // Quote/proposal sent
  WON         // Deal closed
  LOST        // Did not convert
}
```

---

### Model: Automation

Represents one deployed n8n workflow assigned to a tenant. The `n8nWorkflowId` is never exposed to the client portal.

```prisma
model Automation {
  id             String           @id @default(cuid())
  organizationId String
  name           String
  description    String?
  type           String           // lead_capture | appointments | follow_up | crm | retention
  status         AutomationStatus @default(ACTIVE)
  n8nWorkflowId  String?          // Internal n8n workflow reference (hidden from clients)
  webhookSecret  String           // Per-automation HMAC secret (32 random hex bytes)
  config         Json?            // Org-specific configuration overrides
}
```

---

### Enum: AutomationStatus

```prisma
enum AutomationStatus {
  ACTIVE    // Running normally
  PAUSED    // Temporarily stopped
  ERROR     // Failed execution detected by webhook
  ARCHIVED  // Permanently deactivated
}
```

---

### Model: AutomationEvent

Execution history record for an Automation. Written by the `/api/webhooks/n8n/automations` endpoint.

```prisma
model AutomationEvent {
  id             String      @id @default(cuid())
  automationId   String
  organizationId String
  type           String      // e.g. "lead_captured", "appointment_created"
  status         EventStatus @default(PENDING)
  payload        Json?       // Event-specific data
  errorMessage   String?
  duration       Int?        // Execution time in milliseconds
}
```

---

### Enum: EventStatus

```prisma
enum EventStatus {
  PENDING
  SUCCESS
  FAILED
  RETRYING
}
```

---

### Model: Conversation

A WhatsApp (or other channel) conversation thread. Can be AI-handled or escalated to a human.

```prisma
model Conversation {
  id             String             @id @default(cuid())
  organizationId String
  channel        String             // "whatsapp"
  contactPhone   String?
  contactName    String?
  status         ConversationStatus @default(OPEN)
  aiHandled      Boolean            @default(true)
  escalatedAt    DateTime?
  resolvedAt     DateTime?
}
```

---

### Enum: ConversationStatus

```prisma
enum ConversationStatus {
  OPEN       // Active, bot responding
  ESCALATED  // Transferred to human agent
  RESOLVED   // Agent resolved the issue
  CLOSED     // Conversation ended
}
```

---

### Model: Message

Individual message within a Conversation.

```prisma
model Message {
  id             String      @id @default(cuid())
  conversationId String
  role           MessageRole
  content        String      @db.Text
  metadata       Json?
}
```

---

### Enum: MessageRole

```prisma
enum MessageRole {
  USER       // Client / WhatsApp contact
  ASSISTANT  // AI bot response
  SYSTEM     // Internal event (e.g., "Escalated to human")
}
```

---

### Model: Appointment

Calendar appointment, created either by the AI assistant or manually via the portal.

```prisma
model Appointment {
  id             String            @id @default(cuid())
  organizationId String
  leadId         String?           // Optional link to a Lead
  title          String
  description    String?
  startTime      DateTime
  endTime        DateTime
  status         AppointmentStatus @default(SCHEDULED)
  source         String?           // "ai" | "manual"
  metadata       Json?
}
```

**Key indexes:** `[organizationId]`, `[organizationId, startTime]`

---

### Enum: AppointmentStatus

```prisma
enum AppointmentStatus {
  SCHEDULED   // Booked, not yet confirmed
  CONFIRMED   // Confirmed by client or staff
  CANCELLED   // Cancelled
  COMPLETED   // Appointment took place
  NO_SHOW     // Client did not attend
}
```

---

### Model: Request

Support/feature request submitted by a client organization to Reymen.

```prisma
model Request {
  id             String        @id @default(cuid())
  organizationId String
  title          String
  description    String        @db.Text
  type           String        // support | new_automation | change | question
  status         RequestStatus @default(OPEN)
  priority       String        @default("medium") // low | medium | high
  resolvedAt     DateTime?
}
```

---

### Enum: RequestStatus

```prisma
enum RequestStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}
```

---

### Model: Metric

Time-series metric storage for dashboard KPIs and charts.

```prisma
model Metric {
  id             String   @id @default(cuid())
  organizationId String
  key            String
  value          Float
  period         String   // e.g. "2026-05", "2026-05-30"

  @@unique([organizationId, key, period])
}
```

The compound unique constraint prevents duplicate metric entries for the same organization, key, and period.

---

### Model: WebhookEvent

Reliability buffer for inbound n8n webhooks. Every incoming webhook is stored before processing. This enables audit trails and retry logic.

```prisma
model WebhookEvent {
  id             String             @id @default(cuid())
  organizationId String
  source         String             // "n8n"
  eventType      String             // "lead.created" | "automation.event" | etc.
  payload        Json
  status         WebhookEventStatus @default(PENDING)
  attempts       Int                @default(0)
  processedAt    DateTime?
  errorMessage   String?
}
```

---

### Enum: WebhookEventStatus

```prisma
enum WebhookEventStatus {
  PENDING     // Received but not processed
  PROCESSING  // Currently being processed
  PROCESSED   // Successfully processed
  FAILED      // Processing failed after all attempts
}
```

---

### Model: AuditLog

Immutable append-only audit trail of important platform actions.

```prisma
model AuditLog {
  id             String   @id @default(cuid())
  organizationId String?
  userId         String?
  action         String   // e.g. "lead.create", "client.plan_change"
  resource       String   // e.g. "Lead", "Organization", "User"
  resourceId     String?
  metadata       Json?    // Action-specific context
  ipAddress      String?
}
```

**Key indexes:** `[organizationId, createdAt]`, `[userId]`

---

### Model: WhatsAppAssistant

One-to-one with Organization. Stores the AI assistant configuration for a tenant.

```prisma
model WhatsAppAssistant {
  id             String   @id @default(cuid())
  organizationId String   @unique
  name           String   @default("Asistente AI")
  greeting       String   @db.Text
  personality    String?  @db.Text
  capabilities   String[] // ["appointments", "faq", "lead_capture", "follow_up", "escalation"]
  isActive       Boolean  @default(true)
  phoneNumber    String?
}
```

Created/updated atomically via `prisma.whatsAppAssistant.upsert()` — safe to call even if the record doesn't exist yet.

---

### Model: KnowledgeBase

Articles that the AI assistant uses to answer questions. Filterable by category and `isActive`.

```prisma
model KnowledgeBase {
  id             String   @id @default(cuid())
  organizationId String
  title          String
  content        String   @db.Text
  category       String?
  tags           String[] // PostgreSQL text array
  isActive       Boolean  @default(true)
}
```

**Key indexes:** `[organizationId]`, `[organizationId, category]`, `[organizationId, isActive]`

---

### Model: Prompt

AI instruction templates. Multiple prompts per type are allowed, but only one can be `isActive: true` per type per organization (enforced by the `activatePrompt` server action using `$transaction`).

```prisma
model Prompt {
  id             String     @id @default(cuid())
  organizationId String
  name           String
  content        String     @db.Text
  type           PromptType
  isActive       Boolean    @default(false)
}
```

**Key indexes:** `[organizationId]`, `[organizationId, type]`, `[organizationId, type, isActive]`

---

### Enum: PromptType

```prisma
enum PromptType {
  SYSTEM              // Core identity and rules
  GREETING            // Welcome message structure
  LEAD_QUALIFICATION  // How to qualify prospects
  APPOINTMENT_BOOKING // How to schedule appointments
  FAQ                 // How to handle FAQ using KB
  ESCALATION          // When and how to escalate
}
```

---

### Model: AutomationTemplate

A reusable automation blueprint managed by Reymen admins. Clients install templates from the marketplace.

```prisma
model AutomationTemplate {
  id              String   @id @default(cuid())
  name            String
  description     String   @db.Text
  longDescription String?  @db.Text
  industry        String   // clinic | real_estate | gym | legal | workshop | ecommerce
  category        String   // lead_capture | appointments | follow_up | crm | retention
  tags            String[]
  iconEmoji       String   @default("⚡")
  isPublished     Boolean  @default(false)
  currentVersion  String?  // Latest semver, e.g. "1.0.0"
  createdBy       String?  // Admin userId who created it
}
```

---

### Model: TemplateVersion

A specific release of an AutomationTemplate. Contains the actual n8n workflow JSON.

```prisma
model TemplateVersion {
  id              String   @id @default(cuid())
  templateId      String
  version         String   // Semver: "1.0.0"
  changelog       String?  @db.Text
  n8nWorkflowJson Json     // Complete n8n workflow export
  n8nWorkflowId   String?  // ID of the workflow deployed in n8n instance
  defaultConfig   Json?    // Default variable values
  isLatest        Boolean  @default(true)

  @@unique([templateId, version])
}
```

When a new version is added, a `$transaction` atomically:
1. Sets `isLatest: false` on all existing versions for the template.
2. Creates the new version with `isLatest: true`.
3. Updates `AutomationTemplate.currentVersion`.

---

### Model: TemplateInstallation

Tracks which organizations have installed which templates. The compound unique constraint `[organizationId, templateId]` ensures only one installation record per org-template pair (can be ACTIVE or UNINSTALLED).

```prisma
model TemplateInstallation {
  id             String             @id @default(cuid())
  organizationId String
  templateId     String
  versionId      String
  automationId   String?            // FK to the Automation created on install
  status         InstallationStatus @default(PENDING)
  config         Json?

  @@unique([organizationId, templateId])
}
```

---

### Enum: InstallationStatus

```prisma
enum InstallationStatus {
  PENDING      // Install initiated
  INSTALLING   // In progress
  ACTIVE       // Successfully installed and running
  FAILED       // Installation failed
  UNINSTALLED  // Client uninstalled it
}
```

---

## 5. Authentication & RBAC

### JWT Strategy

Authentication is handled by **NextAuth v5** (`next-auth@^5.0.0-beta.25`) with:

- **Session strategy:** `jwt` (stateless JWTs, no server-side session store)
- **Provider:** Credentials (email + bcrypt-hashed password)
- **Adapter:** `@auth/prisma-adapter` (for Account and Session models)

### Login Flow

```
1. User submits email + password
2. Server validates via loginSchema (zod): email format, password min 6
3. prisma.user.findUnique({ where: { email, isActive: true } })
4. bcrypt.compare(password, user.passwordHash)
5. On success: returns { id, email, name, role, organizationId }
6. NextAuth creates JWT containing: id, role, organizationId
7. On every request: JWT is decoded and injected into session
```

### Session Shape

```typescript
interface Session {
  user: {
    id: string;
    role: UserRole;
    organizationId: string | null;
    email: string;
    name?: string;
  }
}
```

The `role` and `organizationId` fields are stored in the JWT at login and do not require a database lookup on each request.

### Helper Functions

```typescript
// src/lib/auth.ts

// Returns true if role is SUPER_ADMIN or ADMIN (Reymen internal)
export function isAdmin(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

// Returns true if role is a client-side role
export function isClientRole(role: UserRole): boolean {
  return ["OWNER", "MANAGER", "AGENT", "VIEWER", "CLIENT"].includes(role);
}
```

### RBAC: Permission System

Fine-grained permissions are enforced by the `can()` function in `src/lib/permissions.ts`.

```typescript
export function can(role: UserRole, action: Action): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}
```

#### Available Actions

```typescript
type Action =
  | "leads:create"
  | "leads:delete"
  | "leads:update_status"
  | "automations:view"
  | "automations:manage"
  | "conversations:view"
  | "conversations:escalate"
  | "conversations:resolve"
  | "knowledge_base:manage"
  | "prompts:manage"
  | "team:manage"
  | "requests:create"
  | "reports:view"
  | "settings:view"
  | "settings:manage";
```

#### Permission Matrix

| Action | SUPER_ADMIN | ADMIN | OWNER | MANAGER | AGENT | VIEWER | CLIENT |
|--------|:-----------:|:-----:|:-----:|:-------:|:-----:|:------:|:------:|
| `leads:create` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `leads:delete` | ✓ | ✓ | ✓ | — | — | — | — |
| `leads:update_status` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `automations:view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `automations:manage` | ✓ | ✓ | ✓ | — | — | — | — |
| `conversations:view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `conversations:escalate` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `conversations:resolve` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `knowledge_base:manage` | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `prompts:manage` | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `team:manage` | ✓ | ✓ | ✓ | ✓ | — | — | — |
| `requests:create` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `reports:view` | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| `settings:view` | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| `settings:manage` | ✓ | ✓ | ✓ | — | — | — | — |

### Plan Limits

```typescript
export const PLAN_LIMITS = {
  starter:      { leads: 500,   users: 2,  automations: 3,  label: "Starter" },
  professional: { leads: 5000,  users: 10, automations: 15, label: "Professional" },
  enterprise:   { leads: 99999, users: 99, automations: 99, label: "Enterprise" },
};
```

Plan limits are defined in `src/lib/permissions.ts` and should be checked in server actions before creating new resources.

---

## 6. Multi-tenancy

### How organizationId scoping works

The platform is a **shared-database, shared-schema** multi-tenant architecture. All tenants share the same PostgreSQL database and schema, with row-level isolation enforced at the application layer.

**The isolation mechanism:**

1. At login, the user's `organizationId` is encoded into the JWT.
2. All Server Actions extract `session.user.organizationId` from the server-side auth context (not user input).
3. Every Prisma query in the portal layer includes `organizationId: session.user.organizationId` in the `where` clause.
4. There is no way for a client to supply their own `organizationId` — it always comes from the verified JWT.

**Example pattern (every portal server action follows this):**

```typescript
export async function createLead(formData: FormData) {
  const session = await auth();
  // organizationId is ALWAYS from the session JWT, never from user input
  if (!session?.user.organizationId) throw new Error("No autorizado");

  await prisma.lead.create({
    data: {
      organizationId: session.user.organizationId, // enforced
      // ... other fields from formData
    },
  });
}
```

### Middleware Route Guard

`src/middleware.ts` runs on every request (except static assets) and enforces:

```typescript
// Admin routes require SUPER_ADMIN or ADMIN
if (isAdminRoute && role !== "SUPER_ADMIN" && role !== "ADMIN") {
  return NextResponse.redirect(new URL("/portal/dashboard", req.url));
}

// Portal routes require an organization
if (isPortalRoute && !session.user.organizationId) {
  return NextResponse.redirect(new URL("/login", req.url));
}
```

Public routes (no auth required):
- `/login` and `/forgot-password`
- `/api/webhooks/*` (secured by HMAC instead of session)
- `/api/auth/*` (NextAuth handlers)

### Why n8n URLs are never exposed to clients

The `n8nWorkflowId` field on the `Automation` model is stored in the database but is **never returned** in portal-facing API responses or rendered in the portal UI. The `triggerN8nWorkflow()` function runs server-side only. Clients see only the automation's name, status, and event history — not any n8n-specific identifiers.

This also means that if Reymen changes the n8n instance URL or migrates workflows, zero client-facing changes are required.

---

## 7. n8n Integration

The integration between the platform and n8n is **bidirectional**:

### Outbound: Platform → n8n (Triggering Workflows)

When the platform needs to invoke an n8n workflow (e.g., trigger a lead follow-up), it uses `triggerN8nWorkflow()` from `src/lib/n8n.ts`:

```typescript
export async function triggerN8nWorkflow(
  webhookPath: string,
  payload: N8nTriggerPayload
): Promise<{ success: boolean; error?: string }>
```

**Parameters:**
- `webhookPath`: the n8n webhook path (e.g., `lead-follow-up`)
- `payload.organizationId`: the tenant ID
- `payload.event`: the event name
- `payload.data`: event-specific data

**How it works:**
1. Serializes the payload to JSON.
2. Creates an HMAC-SHA256 signature using `N8N_WEBHOOK_SECRET`.
3. POSTs to `${N8N_BASE_URL}/webhook/${webhookPath}` with headers:
   - `X-Reymen-Signature: sha256={hex}`
   - `X-Reymen-Source: platform`
4. Returns `{ success: true }` or `{ success: false, error: string }`.

### Inbound: n8n → Platform (Webhook Events)

n8n sends data back to the platform via four webhook endpoints. All are POST routes located under `/api/webhooks/n8n/`.

#### WebhookEvent Reliability Pattern

Every inbound webhook follows the **store-then-process** pattern:

```
1. Verify HMAC signature → reject if invalid (401)
2. Store raw payload as WebhookEvent (status: PROCESSING)
3. Parse and validate the payload
4. Execute business logic (create Lead, update Automation, etc.)
5. Update WebhookEvent status → PROCESSED or FAILED
```

This ensures:
- Every event is recorded before processing begins.
- Failed events are logged with error messages for debugging.
- The system can audit all events received from n8n.

### All 4 Inbound Webhook Routes

#### POST `/api/webhooks/n8n/leads`

Creates a new Lead record from n8n.

**Headers required:**
```
X-Reymen-Signature: sha256={hmac}
X-Reymen-OrgId: {organizationId}
```

**Request body:**
```json
{
  "name": "María García",
  "email": "maria@gmail.com",
  "phone": "+52 55 1234 5678",
  "source": "whatsapp",
  "metadata": { "utm_campaign": "summer-2026" }
}
```

**Behavior:**
- Verifies org is active.
- Creates `Lead` with `source: payload.source ?? "n8n"`.
- Sets `WebhookEvent.eventType = "lead.created"`.

---

#### POST `/api/webhooks/n8n/automations`

Reports an automation execution event (success or failure).

**Request body:**
```json
{
  "automationId": "auto-demo-1",
  "type": "lead_captured",
  "status": "SUCCESS",
  "payload": {},
  "errorMessage": null,
  "duration": 1234
}
```

**Behavior:**
- Creates an `AutomationEvent` record.
- If `status === "FAILED"`, updates `Automation.status = "ERROR"`.
- Sets `WebhookEvent.eventType = "automation.event"`.

---

#### POST `/api/webhooks/n8n/conversations`

Creates or updates a Conversation and appends a Message.

**Request body:**
```json
{
  "conversationId": "optional-existing-id",
  "contactPhone": "+52 55 1234 5678",
  "contactName": "María García",
  "channel": "whatsapp",
  "message": {
    "role": "USER",
    "content": "Hola, quisiera una cita"
  }
}
```

**Behavior:**
- If `conversationId` is provided: looks up that conversation.
- If not: looks up an OPEN conversation by `contactPhone` for the org.
- If none found: creates a new Conversation.
- Always creates a new Message within the conversation.
- Returns `{ success: true, conversationId: "..." }`.

---

#### POST `/api/webhooks/n8n/scoring`

Updates the AI score and reason for a Lead.

**Request body:**
```json
{
  "leadId": "clxyz123",
  "score": 87,
  "reason": "Empresa grande, presupuesto confirmado, decisor identificado."
}
```

**Behavior:**
- Validates `score` is between 0 and 100 (inclusive).
- Verifies Lead belongs to the org and is not soft-deleted (`deletedAt: null`).
- Updates `Lead.score` (rounded to integer) and `Lead.scoreReason`.

---

## 8. Webhook Security

### Per-organization secrets, not a shared global one

Earlier revisions of this platform authenticated every inbound n8n webhook against a
single global `WEBHOOK_SECRET`/`N8N_WEBHOOK_SECRET` env var shared across **all**
organizations. That was a cross-tenant forgery risk: any org's n8n workflow (or
anyone who obtained the one shared value) could forge webhook calls claiming to be
any other organization by simply passing a different `orgId`. This was fixed in the
security review — inbound authentication is now **per-organization**:

- `Organization.n8nWebhookSecret` — a unique, randomly generated secret column,
  backfilled for existing orgs by migration `20260915040000_add_org_webhook_secret`
  and generated automatically for every new org (`createClient` action).
- Rotatable at any time from `/admin/clients/[clientId]` via the webhook info
  dialog (`src/components/admin/OrgWebhookInfoDialog.tsx` → `rotateOrgWebhookSecret`
  action) — rotating immediately invalidates the old value.
- `N8N_WEBHOOK_SECRET` (the env var) is now used **only** for outbound signatures —
  platform → n8n calls in `src/lib/n8n.ts`. It plays no role in verifying inbound
  webhooks anymore.

### HMAC-SHA256 Verification

Inbound webhook endpoints (`/api/webhooks/n8n/{leads,conversations,scoring}`) use
HMAC-SHA256 signing via `src/lib/webhook-validator.ts`, verified against the
**target organization's own** `n8nWebhookSecret`:

```typescript
// route.ts: look up the org's own secret, then verify against it
const org = orgId
  ? await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, n8nWebhookSecret: true } })
  : null;

const authorized = org && isWebhookAuthorized(rawBody, hmacSignature, plainSecret, org.n8nWebhookSecret);
```

```typescript
export function verifyWebhookSignature(
  payload: string,    // raw request body as string
  signature: string,  // value of X-Reymen-Signature header
  secret: string       // that org's n8nWebhookSecret, looked up by orgId
): boolean
```

**Signature format:** `sha256={hex_digest}`

**Algorithm:**
```
HMAC-SHA256(key=secret, message=rawBody) → hex → "sha256=" + hex
```

### Constant-Time Comparison

Verification uses `crypto.timingSafeEqual` (via the `secretsMatch()` helper in
`webhook-validator.ts`) to prevent **timing attacks**, replacing an earlier
hand-rolled XOR-accumulator comparison:

```typescript
export function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

The length check short-circuits before the constant-time comparison to avoid
leaking length information via timing; `Buffer` lengths, not string character
counts, are compared to stay correct for multi-byte content.

### Raw Body Requirement

The signature is computed over the **raw request body bytes**, before JSON parsing. This is why all webhook handlers use:

```typescript
const rawBody = await req.text(); // NOT req.json()
// ... verify signature against rawBody ...
const payload = JSON.parse(rawBody); // parse after verification
```

If you use `req.json()` first, the body stream is consumed and the raw bytes may differ (whitespace, encoding) from what n8n signed.

### Dual Auth: Knowledge Base API

The `/api/v1/knowledge-base` endpoint supports two authentication methods:

1. **API key** (`x-api-key` header): checked with `secretsMatch()` against the
   **target organization's own** `n8nWebhookSecret` — not a global env var. The
   `orgId` must be passed as `?orgId=xxx` query parameter, and the key must match
   that specific org's secret; a key valid for one org is rejected for any other.
2. **Session** (NextAuth JWT cookie): for portal browser access, used when no
   `x-api-key` header is present. The `orgId` is extracted from
   `session.user.organizationId`, so a logged-in user can only ever reach their
   own org's knowledge base regardless of query params.

---

## 9. API Reference

### POST `/api/webhooks/n8n/leads`

| Property | Value |
|----------|-------|
| Auth | HMAC (`X-Reymen-Signature`) |
| Tenant | `X-Reymen-OrgId` header |
| Creates | `Lead`, `WebhookEvent` |

**Request:**
```http
POST /api/webhooks/n8n/leads
X-Reymen-Signature: sha256=abc123...
X-Reymen-OrgId: org_cuid_here
Content-Type: application/json

{
  "name": "string (required)",
  "email": "string (optional)",
  "phone": "string (optional)",
  "source": "string (optional, defaults to 'n8n')",
  "metadata": {}
}
```

**Responses:**

| Status | Body |
|--------|------|
| 200 | `{ "success": true }` |
| 401 | `{ "error": "Unauthorized" }` |
| 500 | `{ "error": "Processing failed" }` |

---

### POST `/api/webhooks/n8n/automations`

| Property | Value |
|----------|-------|
| Auth | HMAC (`X-Reymen-Signature`) |
| Tenant | `X-Reymen-OrgId` header |
| Creates | `AutomationEvent`; may update `Automation.status` |

**Request:**
```http
POST /api/webhooks/n8n/automations
X-Reymen-Signature: sha256=abc123...
X-Reymen-OrgId: org_cuid_here
Content-Type: application/json

{
  "automationId": "string (required)",
  "type": "string (required, e.g. 'lead_captured')",
  "status": "SUCCESS | FAILED | PENDING",
  "payload": {},
  "errorMessage": "string (optional)",
  "duration": 1234
}
```

**Side effect:** If `status === "FAILED"`, sets `Automation.status = "ERROR"`.

---

### POST `/api/webhooks/n8n/conversations`

| Property | Value |
|----------|-------|
| Auth | HMAC (`X-Reymen-Signature`) |
| Tenant | `X-Reymen-OrgId` header |
| Creates | `Conversation` (if not found), `Message` |

**Request:**
```http
POST /api/webhooks/n8n/conversations
X-Reymen-Signature: sha256=abc123...
X-Reymen-OrgId: org_cuid_here
Content-Type: application/json

{
  "conversationId": "string (optional)",
  "contactPhone": "string (required)",
  "contactName": "string (optional)",
  "channel": "string (required, e.g. 'whatsapp')",
  "message": {
    "role": "USER | ASSISTANT | SYSTEM",
    "content": "string"
  }
}
```

**Response:** `{ "success": true, "conversationId": "string" }`

---

### POST `/api/webhooks/n8n/scoring`

| Property | Value |
|----------|-------|
| Auth | HMAC (`X-Reymen-Signature`) |
| Tenant | `X-Reymen-OrgId` header |
| Updates | `Lead.score`, `Lead.scoreReason` |

**Request:**
```http
POST /api/webhooks/n8n/scoring
X-Reymen-Signature: sha256=abc123...
X-Reymen-OrgId: org_cuid_here
Content-Type: application/json

{
  "leadId": "string (required)",
  "score": 87,
  "reason": "string (optional)"
}
```

**Validation:** `score` must be between 0 and 100.

---

### GET `/api/v1/knowledge-base`

| Property | Value |
|----------|-------|
| Auth | `x-api-key` header OR NextAuth session |
| Returns | Active knowledge base articles for an org |

**Query parameters:**
- `orgId` (required if using API key auth)
- `category` (optional, filter by category)
- `q` (optional, full-text search in title and content)

**Request (n8n internal caller):**
```http
GET /api/v1/knowledge-base?orgId=org_cuid&category=faq&q=horario
x-api-key: {N8N_WEBHOOK_SECRET}
```

**Request (browser/session caller):**
```http
GET /api/v1/knowledge-base?category=faq
Cookie: next-auth.session-token=...
```

**Response:**
```json
{
  "data": [
    {
      "id": "string",
      "title": "string",
      "content": "string",
      "category": "string",
      "tags": ["string"],
      "updatedAt": "ISO8601"
    }
  ],
  "meta": { "total": 5 }
}
```

---

### GET `/api/portal/leads/export`

| Property | Value |
|----------|-------|
| Auth | NextAuth session (organizationId required) |
| Returns | CSV file download |

**Request:**
```http
GET /api/portal/leads/export
Cookie: next-auth.session-token=...
```

**Response:**
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="leads-2026-05-30.csv"`

**CSV columns:** Nombre, Email, Teléfono, Fuente, Estado, Score AI, Notas, Fecha

Only returns leads where `deletedAt IS NULL` for the session's organization, ordered by `createdAt DESC`.

CSV special characters (commas, quotes, newlines within values) are properly escaped using RFC 4180 quoting rules.

---

## 10. Server Actions

All Server Actions are located in `src/actions/`. They use the `"use server"` directive and are the primary data mutation layer for the portal and admin.

### admin/clients.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createClient` | `(formData: FormData) => Promise<{ success: true, orgId: string }>` | Creates an Organization + OWNER user atomically |
| `changePlan` | `(orgId: string, plan: string) => Promise<{ success: true, plan: string }>` | Updates organization plan; validates against `["starter","professional","enterprise"]` |
| `updateClientStatus` | `(orgId: string, isActive: boolean) => Promise<{ success: true }>` | Activates or deactivates an organization |
| `assignAutomation` | `(orgId: string, data: { name, type, description?, n8nWorkflowId? }) => Promise<{ success: true, automationId: string }>` | Creates an Automation record for a client |

All require `isAdmin(session.user.role)`.

---

### admin/templates.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createTemplate` | `(data: TemplateSchema) => Promise<{ success: true, templateId: string }>` | Creates a new unpublished template |
| `updateTemplate` | `(templateId: string, data: Partial<TemplateSchema>) => Promise<{ success: true }>` | Updates template metadata |
| `publishTemplate` | `(templateId: string, isPublished: boolean) => Promise<{ success: true }>` | Publishes or unpublishes; requires at least one version to publish |
| `addTemplateVersion` | `(templateId: string, data: VersionSchema) => Promise<{ success: true }>` | Adds a new semver version; uses `$transaction` to atomically set `isLatest` |
| `installTemplateForClient` | `(orgId, templateId, versionId, config?) => Promise<{ success: true, automationId: string }>` | Admin-side installation: creates Automation + TemplateInstallation |

---

### leads.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createLead` | `(formData: FormData) => Promise<{ success: true, leadId: string }>` | Creates a lead for the session's org; logs audit |
| `updateLeadStatus` | `(leadId: string, status: LeadStatus) => Promise<{ success: true }>` | Updates status; verifies org ownership |
| `deleteLead` | `(leadId: string) => Promise<{ success: true }>` | Soft-deletes (sets `deletedAt`); logs audit |

---

### requests.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createRequest` | `(formData: FormData) => Promise<{ success: true }>` | Creates a support request; validates type enum |
| `updateRequestStatus` | `(requestId: string, status: RequestStatus) => Promise<{ success: true }>` | Admins can update any request; clients only their org's requests |

---

### conversations.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `escalateConversation` | `(conversationId: string) => Promise<{ success: true }>` | Sets status to ESCALATED; only works on OPEN conversations |
| `resolveConversation` | `(conversationId: string) => Promise<{ success: true }>` | Sets status to RESOLVED; records `resolvedAt` |

---

### knowledge-base.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createArticle` | `(data: ArticleSchema) => Promise<{ success: true }>` | Creates KB article for org |
| `updateArticle` | `(id: string, data: ArticleSchema) => Promise<{ success: true }>` | Updates article; verifies org ownership |
| `deleteArticle` | `(id: string) => Promise<{ success: true }>` | Hard-deletes article |
| `toggleArticle` | `(id: string, isActive: boolean) => Promise<{ success: true }>` | Activates or deactivates article |

---

### prompts.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createPrompt` | `(data: PromptSchema) => Promise<{ success: true }>` | Creates prompt with `isActive: false` |
| `updatePrompt` | `(id: string, data: Partial<PromptSchema>) => Promise<{ success: true }>` | Updates prompt content/name |
| `activatePrompt` | `(id: string, type: PromptType) => Promise<{ success: true }>` | Atomically deactivates all prompts of the type, activates target |
| `deletePrompt` | `(id: string) => Promise<{ success: true }>` | Hard-deletes prompt |

---

### whatsapp-assistant.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `upsertWhatsAppAssistant` | `(data: UpsertSchema) => Promise<{ success: true }>` | Creates or updates the assistant config for the org |
| `toggleAssistant` | `(isActive: boolean) => Promise<{ success: true }>` | Activates or deactivates the assistant; creates record if it doesn't exist |

---

### templates.ts (portal)

| Action | Signature | Description |
|--------|-----------|-------------|
| `installTemplate` | `(data: { templateId, config? }) => Promise<{ success: true, automationId: string }>` | Installs latest published version; creates Automation + TemplateInstallation; logs audit |
| `uninstallTemplate` | `(templateId: string) => Promise<{ success: true }>` | Sets installation to UNINSTALLED and archives the Automation atomically |

---

### team.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `inviteTeamMember` | `(data: { name, email, role, password }) => Promise<{ success: true }>` | Creates a new user (MANAGER/AGENT/VIEWER) in the org; checks `can(role, "team:manage")` |
| `removeTeamMember` | `(userId: string) => Promise<{ success: true }>` | Soft-deactivates user; cannot remove self or OWNER |

---

### appointments.ts

| Action | Signature | Description |
|--------|-----------|-------------|
| `createAppointment` | `(data: { title, description?, startTime, endTime }) => Promise<{ success: true }>` | Creates appointment; validates `endTime > startTime` |
| `updateAppointmentStatus` | `(appointmentId: string, status: AppointmentStatus) => Promise<{ success: true }>` | Updates status; verifies org ownership |

---

## 11. Template Engine

### AutomationTemplate Lifecycle

```
DRAFT (isPublished: false)
  │
  ├── addTemplateVersion() ──→ TemplateVersion created (isLatest: true)
  │
  └── publishTemplate()  ──→ isPublished: true (requires at least 1 version)
                                │
                                ▼
                         PUBLISHED (visible in marketplace)
                                │
                                ├── installTemplate() (client self-service)
                                │     or
                                └── installTemplateForClient() (admin)
                                          │
                                          ▼
                                 TemplateInstallation (ACTIVE)
                                 + Automation (ACTIVE)
```

### TemplateVersion Semver

Version strings must match the regex `/^\d+\.\d+\.\d+$/` (e.g., `1.0.0`, `2.3.1`). The version is unique per template (`@@unique([templateId, version])`).

When adding a new version via `addTemplateVersion()`, a single `$transaction` ensures atomicity:

```typescript
await prisma.$transaction([
  // 1. Mark all existing versions as not latest
  prisma.templateVersion.updateMany({
    where: { templateId },
    data: { isLatest: false },
  }),
  // 2. Create new version as latest
  prisma.templateVersion.create({
    data: { ..., isLatest: true },
  }),
  // 3. Update currentVersion pointer on the template
  prisma.automationTemplate.update({
    where: { id: templateId },
    data: { currentVersion: parsed.version },
  }),
]);
```

### TemplateInstallation Uniqueness Constraint

`@@unique([organizationId, templateId])` means one org can only have one installation record per template. The status field (`ACTIVE` / `UNINSTALLED`) tracks whether the template is currently active.

**Re-installation behavior:**
- If an existing record with status `UNINSTALLED` is found, it is **updated** (not a new record created).
- If status is `ACTIVE`, an error is thrown: "Este template ya está instalado."

### Install Flow

When a client installs a template:

1. Find the published template and its latest version.
2. Check for existing installation (throw if already ACTIVE).
3. Create an `Automation` record for the org (with `webhookSecret` generated via `crypto.getRandomValues()`).
4. Create or update a `TemplateInstallation` record with `status: "ACTIVE"` and a reference to the new Automation's ID.
5. Log an audit event: `action: "template.install"`.
6. Revalidate `/portal/templates` and `/portal/automations` paths.

### Uninstall Flow

When a client uninstalls a template:

```typescript
await prisma.$transaction([
  // Mark installation as UNINSTALLED
  prisma.templateInstallation.update({
    where: { id: installation.id },
    data: { status: "UNINSTALLED" },
  }),
  // Archive the associated Automation (if automationId exists)
  prisma.automation.update({
    where: { id: installation.automationId },
    data: { status: "ARCHIVED" },
  }),
]);
```

---

## 12. Audit System

### logAudit() Signature

```typescript
// src/lib/audit.ts
export async function logAudit(params: {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void>
```

### Fire-and-Forget Pattern

The `logAudit()` function wraps the Prisma call in a `try/catch` that silently swallows errors:

```typescript
try {
  await prisma.auditLog.create({ data: { ... } });
} catch {
  // Audit failures must never break the main operation
}
```

This is intentional: if the audit log write fails (e.g., DB connection hiccup), the primary business operation (creating a lead, changing a plan) must still succeed. The audit trail is important but not mission-critical.

Note that `logAudit` is marked `"use server"` and is always called from within a Server Action — never from the client side.

### AuditLog Schema

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | `String?` | Tenant context (null for platform-level events) |
| `userId` | `String?` | Who performed the action |
| `action` | `String` | Event identifier (dot-notation convention) |
| `resource` | `String` | Entity type affected |
| `resourceId` | `String?` | ID of the affected entity |
| `metadata` | `Json?` | Action-specific context data |
| `ipAddress` | `String?` | Reserved for future use |
| `createdAt` | `DateTime` | Auto-set to `now()` |

### All Tracked Events

| Action | Resource | Where called | Metadata |
|--------|----------|-------------|----------|
| `lead.create` | `Lead` | `createLead()` | `{ name, source }` |
| `lead.delete` | `Lead` | `deleteLead()` | — |
| `client.create` | `Organization` | `createClient()` | `{ name, slug }` |
| `client.plan_change` | `Organization` | `changePlan()` | `{ newPlan }` |
| `team.invite` | `User` | `inviteTeamMember()` | `{ email, role }` |
| `team.remove` | `User` | `removeTeamMember()` | `{ email }` |
| `template.install` | `TemplateInstallation` | `installTemplate()` | `{ templateName, version }` |
| `template.uninstall` | `TemplateInstallation` | `uninstallTemplate()` | — |

---

## 13. Environment Variables

> Updated after the security review and per-organization webhook secret migration
> (see [§8 Webhook Security](#8-webhook-security)). The old global `WEBHOOK_SECRET`
> and `KNOWLEDGE_BASE_API_KEY` variables described in earlier drafts of this document
> **no longer exist** — inbound webhook/API-key auth is now validated per-organization
> against `Organization.n8nWebhookSecret` in the database (rotatable from the admin
> client detail page), not a shared env var. Treat this section, not any cached
> copy, as the source of truth.

### Core — the app will not start or will be actively insecure without these

| Variable | Required | What breaks without it |
|----------|----------|-------------------------|
| `DATABASE_URL` | Yes | App cannot start; Prisma has no database to connect to. |
| `AUTH_SECRET` (`NEXTAUTH_SECRET` also accepted, for back-compat with older Auth.js configs) | Yes | Session/JWT signing has no key. Auth.js refuses to start in production without one; in dev it falls back to an insecure generated value and logs a warning — never rely on that fallback in production. Generate with `openssl rand -base64 32`. |
| `N8N_BASE_URL` | Yes | Platform → n8n calls (triggering automations) have nowhere to go. Use the Docker service name in containerized environments (`http://n8n:5678`), not `localhost`. |
| `N8N_WEBHOOK_SECRET` | Yes | Used only for **outbound** HMAC signatures on platform → n8n calls (`src/lib/n8n.ts`). n8n must be configured with the same value to verify them. This is unrelated to the per-organization secret used for **inbound** n8n → platform webhooks — see below. |
| `NEXT_PUBLIC_APP_URL` | Yes | Baked into emails (password reset links, notifications) and absolute links. Wrong value silently produces broken links, not an error. |

### Auth / reverse proxy

| Variable | Required | What breaks without it |
|----------|----------|-------------------------|
| `AUTH_TRUST_HOST` | Production only, and only when the app sits behind a reverse proxy or load balancer (Nginx, an ALB, etc.) | Without it, `next start` in production rejects every request with `UntrustedHost: Host must be trusted`, because Auth.js refuses to trust the incoming `Host` header by default. **Only set `AUTH_TRUST_HOST=true` when that proxy is trusted to set an accurate `Host`/`X-Forwarded-Host`** — enabling it on an app directly reachable from the internet (no proxy in front) lets a client spoof its own Host header. |
| `NEXTAUTH_URL` | Production only | Without it, some Auth.js redirect/callback URLs can be inferred incorrectly. In development this is inferred from the request and can be omitted. |

### Per-organization webhook secret (replaces the old global `WEBHOOK_SECRET`)

Inbound n8n → platform webhooks (`/api/webhooks/n8n/{leads,conversations,scoring}`) and the
`/api/v1/knowledge-base` API-key route are authenticated per-organization against
`Organization.n8nWebhookSecret`, a unique value stored in the database and generated
automatically when a client organization is created. **There is no env var to configure
for this** — it's managed entirely from `/admin/clients/[clientId]` (view/rotate dialog).
If an organization's secret is compromised, rotate it there; the old value stops working
immediately.

### Optional — feature stays cleanly disabled/hidden without these, nothing crashes

| Variable | Gates | What happens without it |
|----------|-------|--------------------------|
| `RESEND_API_KEY` / `EMAIL_FROM` | Transactional email (password reset, notifications) | Without `RESEND_API_KEY`, emails are logged to the console instead of sent — password reset and notification flows still "succeed" but no email arrives. Set both before relying on email in production. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_PROFESSIONAL` / `STRIPE_PRICE_ENTERPRISE` | Billing (upgrade/manage-billing UI, Stripe webhook route) | Without `STRIPE_SECRET_KEY`, the upgrade/manage-billing UI stays hidden. `STRIPE_WEBHOOK_SECRET` gates `/api/webhooks/stripe`; without it that route rejects incoming Stripe events. |
| `SENTRY_DSN` (server) / `NEXT_PUBLIC_SENTRY_DSN` (client) | Error tracking | Without these, `sentry.server.config.ts` / `sentry.edge.config.ts` / `instrumentation-client.ts` initialize Sentry with no DSN, so error capture is a no-op — errors are only visible in server logs, not in Sentry. Not knowing about this in production means silently losing visibility into crashes. |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Source map upload at build time | Build-time only, unrelated to runtime error capture. Without them, Sentry still receives errors (if `SENTRY_DSN` is set) but stack traces point at minified code instead of original source. |
| `NEXT_PUBLIC_APP_NAME` | Branding text | Falls back to a hardcoded default app name. |

### Required for a specific endpoint (fails closed, not silently disabled)

| Variable | Required for | What breaks without it |
|----------|---------------|--------------------------|
| `CRON_SECRET` | `POST /api/cron/retry-webhooks` (scheduled webhook retry) | The route returns `401 Unauthorized` with `"CRON_SECRET not configured"` if unset — **it fails closed, not open**. Whatever scheduler calls this endpoint (cron on the VPS, a platform's scheduled-job feature) must send it as a bearer token/header matching this value. Without it configured, the webhook retry mechanism silently never runs. |

### Deployment checklist

Before going to production, confirm:

- [ ] `DATABASE_URL` points at the production database, not a local/dev one.
- [ ] `AUTH_SECRET` is a freshly generated value (`openssl rand -base64 32`), not reused from a dev `.env`.
- [ ] `AUTH_TRUST_HOST=true` is set **if and only if** a trusted reverse proxy/load balancer sits in front of the app; confirm the proxy strips/overwrites any client-supplied `X-Forwarded-Host` before it reaches the app.
- [ ] `N8N_BASE_URL` uses the internal/container network address n8n is actually reachable at from the app's runtime environment.
- [ ] `N8N_WEBHOOK_SECRET` matches what's configured on the n8n side for outbound signature verification.
- [ ] `NEXT_PUBLIC_APP_URL` is the real public URL (affects every link in every email sent).
- [ ] `RESEND_API_KEY` is set if email delivery is expected to actually work (otherwise emails silently just log to console).
- [ ] `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set if you want production errors to show up anywhere other than server logs.
- [ ] `CRON_SECRET` is set and the scheduler calling `/api/cron/retry-webhooks` is configured with the matching value — otherwise failed webhook deliveries never retry.
- [ ] Stripe vars are set together (all four) if billing is meant to be live; a partially-configured set (e.g. `STRIPE_SECRET_KEY` without `STRIPE_WEBHOOK_SECRET`) can accept payments UI-side while silently failing to process the webhook that confirms them.
- [ ] Each client organization's `n8nWebhookSecret` (auto-generated on creation) has been shared with whoever configures that org's n8n workflows — there's no shared/global fallback anymore.

---

## 14. Local Development Setup

### Prerequisites

- **Node.js** 20 or higher (22 recommended, matches Docker)
- **Docker** and **Docker Compose** (for PostgreSQL and n8n)
- **npm** or compatible package manager

### Step-by-Step Setup

#### 1. Clone the repository

```bash
git clone https://github.com/your-org/reymen-ai-ops-platform.git
cd reymen-ai-ops-platform
```

#### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/reymen_ops"
AUTH_SECRET="your-random-secret-min-32-chars"
N8N_BASE_URL="http://localhost:5678"
N8N_WEBHOOK_SECRET="your-64-char-hex-webhook-secret"
NEXTAUTH_URL="http://localhost:3000"
```

#### 3. Start infrastructure services

```bash
docker compose -f docker/docker-compose.yml up -d
```

This starts:
- **PostgreSQL 16** on port `5432` (database: `reymen_ops`)
- **n8n** on port `5678` (admin: `admin` / `changeme`)

Wait for services to be healthy (10-15 seconds).

#### 4. Run database migrations

```bash
npm run db:migrate
```

This applies all Prisma migrations and generates the Prisma client.

#### 5. Seed the database

```bash
npm run db:seed
```

This creates:
- Admin user: `admin@reymen.io` / `admin123456`
- Demo client (Clínica San Rafael): `carlos@clinicasanrafael.com` / `client123456`
- Sample leads, automations, conversations, appointments
- WhatsApp assistant configuration
- Knowledge base articles
- Prompts
- 6 automation templates

#### 6. Install dependencies and start dev server

```bash
npm install
npm run dev
```

The application will be available at `http://localhost:3000`.

### Demo Credentials

| Role | Email | Password | Access |
|------|-------|----------|--------|
| SUPER_ADMIN | `admin@reymen.io` | `admin123456` | `/admin/*` |
| OWNER (client) | `carlos@clinicasanrafael.com` | `client123456` | `/portal/*` |

### Useful npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:push` | Push schema changes without migrations (dev only) |
| `npm run db:migrate` | Run migrations and generate client |
| `npm run db:seed` | Seed database with demo data |
| `npm run db:studio` | Open Prisma Studio (database browser GUI) |

---

## 15. Docker Deployment

### Development Docker Setup

**File:** `docker/docker-compose.yml`

Starts PostgreSQL and n8n only (the Next.js app runs on the host via `npm run dev`).

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: reymen_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: reymen_ops
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: ...

  n8n:
    image: n8nio/n8n:latest
    container_name: reymen_n8n
    environment:
      N8N_HOST: 0.0.0.0
      N8N_PORT: 5678
      N8N_BASIC_AUTH_ACTIVE: true
      N8N_BASIC_AUTH_USER: admin
      N8N_BASIC_AUTH_PASSWORD: changeme
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      # ... (n8n uses the same postgres instance, different DB)
    ports: ["5678:5678"]
    depends_on: postgres (service_healthy)
```

### Production Docker Setup

**File:** `docker/docker-compose.prod.yml`

Full production stack: app + postgres + n8n + nginx + certbot (Let's Encrypt).

```yaml
services:
  app:          # Next.js app built from Dockerfile
  postgres:     # PostgreSQL 16 (env from .env)
  n8n:          # n8n (env from .env.n8n)
  nginx:        # Reverse proxy with TLS termination
  certbot:      # Let's Encrypt certificate management
```

Key differences from dev:
- App is containerized (not running on host).
- `env_file: ../.env` loads all environment variables from `.env`.
- Nginx handles TLS on ports 80 and 443.
- certbot volumes share certificate storage with nginx.

### Dockerfile (Multi-Stage Build)

**File:** `docker/Dockerfile`

```dockerfile
# Stage 1: deps — install node_modules only
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: builder — generate Prisma client and build Next.js
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# Stage 3: runner — minimal production image
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
# Copy only the production artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

**Key design decisions:**
- Three stages minimize final image size (only production artifacts in the runner).
- Runs as non-root user `nextjs` (UID 1001) for security.
- Requires `output: 'standalone'` in `next.config.ts` for the `node server.js` command.
- Prisma client is generated during build (not at runtime).

### OVH VPS Deployment Notes

When deploying to an OVH VPS (or any Linux VPS):

1. **Point your domain DNS** to the VPS IP.
2. **Configure Nginx** (`docker/nginx.conf`) with your domain name.
3. **Obtain SSL certificate** via certbot:
   ```bash
   docker compose -f docker/docker-compose.prod.yml run --rm certbot certonly \
     --webroot -w /var/www/certbot -d yourdomain.com
   ```
4. **Set production env vars** in `.env` and `.env.n8n`.
5. **Run migrations** before starting the app:
   ```bash
   docker compose -f docker/docker-compose.prod.yml run --rm app \
     npx prisma migrate deploy
   ```
6. **Start all services:**
   ```bash
   docker compose -f docker/docker-compose.prod.yml up -d
   ```

---

## 16. Directory Structure

```
reymen-ai-ops-platform/
├── docker/
│   ├── docker-compose.yml          # Dev: postgres + n8n only
│   ├── docker-compose.prod.yml     # Prod: app + postgres + n8n + nginx + certbot
│   └── Dockerfile                  # Multi-stage production build
├── prisma/
│   ├── schema.prisma               # Complete database schema
│   └── seed.ts                     # Demo data seeder (tsx)
├── src/
│   ├── actions/                    # Next.js Server Actions ("use server")
│   │   ├── admin/
│   │   │   ├── clients.ts          # createClient, changePlan, updateClientStatus, assignAutomation
│   │   │   └── templates.ts        # createTemplate, publishTemplate, addTemplateVersion, installTemplateForClient
│   │   ├── appointments.ts         # createAppointment, updateAppointmentStatus
│   │   ├── conversations.ts        # escalateConversation, resolveConversation
│   │   ├── knowledge-base.ts       # createArticle, updateArticle, deleteArticle, toggleArticle
│   │   ├── leads.ts                # createLead, updateLeadStatus, deleteLead
│   │   ├── prompts.ts              # createPrompt, updatePrompt, activatePrompt, deletePrompt
│   │   ├── requests.ts             # createRequest, updateRequestStatus
│   │   ├── team.ts                 # inviteTeamMember, removeTeamMember
│   │   ├── templates.ts            # installTemplate, uninstallTemplate (portal)
│   │   └── whatsapp-assistant.ts   # upsertWhatsAppAssistant, toggleAssistant
│   ├── app/
│   │   ├── (admin)/                # Admin route group
│   │   │   ├── admin/
│   │   │   │   ├── api-docs/       # Webhook reference page
│   │   │   │   ├── audit/          # Audit log viewer
│   │   │   │   ├── automations/    # Global automations list
│   │   │   │   ├── clients/        # Client management + [clientId] detail
│   │   │   │   ├── dashboard/      # Admin KPIs
│   │   │   │   ├── escalations/    # Escalated conversations
│   │   │   │   ├── metrics/        # Global charts
│   │   │   │   ├── requests/       # All client requests
│   │   │   │   ├── settings/       # System stats + env vars
│   │   │   │   └── templates/      # Template management + [templateId] detail
│   │   │   └── layout.tsx          # Admin layout with AdminSidebar
│   │   ├── (auth)/                 # Auth route group (public)
│   │   │   ├── login/page.tsx      # Login form
│   │   │   └── layout.tsx          # Centered auth layout
│   │   ├── (portal)/               # Portal route group
│   │   │   ├── portal/
│   │   │   │   ├── appointments/   # Appointment calendar/list
│   │   │   │   ├── automations/    # Automation list + [id] detail
│   │   │   │   ├── conversations/  # Conversation list + [id] thread
│   │   │   │   ├── dashboard/      # Client KPI dashboard
│   │   │   │   ├── knowledge-base/ # KB article management
│   │   │   │   ├── leads/          # Lead CRM table
│   │   │   │   ├── onboarding/     # First-time setup guide
│   │   │   │   ├── prompts/        # Prompt management
│   │   │   │   ├── reports/        # Charts + ROI calculator
│   │   │   │   ├── requests/       # Support requests
│   │   │   │   ├── settings/       # Org config + team management
│   │   │   │   ├── templates/      # Template marketplace
│   │   │   │   └── whatsapp/       # WhatsApp AI config
│   │   │   └── layout.tsx          # Portal layout with PortalSidebar
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/ # NextAuth handlers
│   │   │   ├── portal/leads/export/ # CSV export route
│   │   │   ├── v1/knowledge-base/  # Dual-auth KB query endpoint
│   │   │   └── webhooks/n8n/
│   │   │       ├── automations/    # Receive automation events
│   │   │       ├── conversations/  # Receive conversation messages
│   │   │       ├── leads/          # Receive new leads
│   │   │       └── scoring/        # Receive AI lead scores
│   │   ├── globals.css             # Global Tailwind base styles
│   │   ├── layout.tsx              # Root layout (html, body, Sonner toaster)
│   │   └── page.tsx                # Root redirect (→ /portal/dashboard)
│   ├── components/
│   │   ├── admin/                  # Admin-only components
│   │   │   ├── AddVersionDialog.tsx        # Add template version form
│   │   │   ├── AdminSidebar.tsx            # Admin navigation sidebar
│   │   │   ├── ChangePlanDialog.tsx        # Plan change confirmation
│   │   │   ├── CreateClientDialog.tsx      # New org + user form
│   │   │   ├── CreateTemplateDialog.tsx    # New template form
│   │   │   ├── InstallForClientDialog.tsx  # Admin template install
│   │   │   ├── PublishTemplateButton.tsx   # Publish/unpublish toggle
│   │   │   └── UpdateRequestStatusSelect.tsx # Inline status updater
│   │   ├── charts/                 # Recharts-based chart components
│   │   │   ├── AutomationHealthChart.tsx   # Bar chart: active/error/archived
│   │   │   ├── LeadFunnelChart.tsx         # Funnel chart: lead stages
│   │   │   └── LeadTrendChart.tsx          # Line chart: leads over time
│   │   ├── portal/                 # Portal-specific interactive components
│   │   │   ├── ActivatePromptButton.tsx    # Activate prompt with transition
│   │   │   ├── AppointmentStatusSelect.tsx # Status dropdown for appointments
│   │   │   ├── ArticleDialog.tsx           # Create/edit KB article modal
│   │   │   ├── AssistantConfigForm.tsx     # WhatsApp assistant config form
│   │   │   ├── AssistantToggle.tsx         # Activate/deactivate bot switch
│   │   │   ├── ConversationActions.tsx     # Escalate/resolve buttons
│   │   │   ├── CopyButton.tsx              # Copy-to-clipboard utility
│   │   │   ├── CreateAppointmentDialog.tsx # New appointment form modal
│   │   │   ├── CreateLeadDialog.tsx        # New lead form modal
│   │   │   ├── CreateRequestDialog.tsx     # New request form modal
│   │   │   ├── DeleteArticleButton.tsx     # KB article delete with confirm
│   │   │   ├── ExportLeadsButton.tsx       # Triggers CSV download
│   │   │   ├── InstallTemplateButton.tsx   # 1-click template install
│   │   │   ├── InviteUserForm.tsx          # Team member invitation form
│   │   │   ├── LeadActions.tsx             # Lead status update dropdown
│   │   │   ├── LeadTableClient.tsx         # Client-side sortable lead table
│   │   │   ├── PortalSidebar.tsx           # Portal navigation sidebar
│   │   │   ├── PromptDialog.tsx            # Create/edit prompt modal
│   │   │   ├── RemoveUserButton.tsx        # Team member removal
│   │   │   ├── RoiCalculator.tsx           # Interactive ROI simulator
│   │   │   └── TemplateFilters.tsx         # Industry/category filter bar
│   │   ├── shared/                 # Shared across admin and portal
│   │   │   ├── EmptyState.tsx              # Empty list placeholder
│   │   │   ├── LeadScoreBadge.tsx          # Colored badge for AI score
│   │   │   ├── MetricCard.tsx              # KPI card component
│   │   │   ├── PageHeader.tsx              # Page title + action button
│   │   │   ├── StatusBadge.tsx             # Colored status pill
│   │   │   └── TopBar.tsx                  # Top navigation bar
│   │   └── ui/                     # Base Radix UI primitive wrappers
│   │       ├── badge.tsx, button.tsx, card.tsx, dialog.tsx
│   │       ├── input.tsx, label.tsx, select.tsx, separator.tsx
│   │       └── textarea.tsx
│   ├── lib/
│   │   ├── audit.ts                # logAudit() fire-and-forget
│   │   ├── auth.ts                 # NextAuth config, isAdmin(), isClientRole()
│   │   ├── n8n.ts                  # triggerN8nWorkflow() outbound client
│   │   ├── permissions.ts          # can(), PLAN_LIMITS, ROLE_PERMISSIONS
│   │   ├── prisma.ts               # Prisma singleton client
│   │   ├── tenant.ts               # getOrganizationBySlug/Id(), assertOrgAccess()
│   │   ├── utils.ts                # cn(), formatDate(), generateSlug(), generateWebhookSecret()
│   │   └── webhook-validator.ts    # verifyWebhookSignature(), createWebhookSignature()
│   ├── middleware.ts               # Route guard: auth + role enforcement
│   └── types/
│       ├── api.ts                  # API response type definitions
│       └── domain.ts               # Domain model type aliases
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.ts
```

---

## 17. Key Patterns

### 1. Atomic Prompt Activation via $transaction

Only one prompt per type per organization can be active. The `activatePrompt()` server action uses a `$transaction` to guarantee atomicity:

```typescript
await prisma.$transaction([
  // First: deactivate ALL prompts of this type for the org
  prisma.prompt.updateMany({
    where: { organizationId: session.user.organizationId, type },
    data: { isActive: false },
  }),
  // Second: activate only the target prompt
  prisma.prompt.update({
    where: { id },
    data: { isActive: true },
  }),
]);
```

Without the transaction, a race condition could leave two prompts active simultaneously.

### 2. Soft Deletes on Lead

Leads are never hard-deleted. Instead, `deletedAt` is set to `new Date()`:

```typescript
await prisma.lead.update({
  where: { id: leadId },
  data: { deletedAt: new Date() },
});
```

All portal queries filter for `deletedAt: null` (or `where: { deletedAt: null }`). The CSV export also excludes soft-deleted leads. The admin audit log retains the deletion event.

### 3. Compound Unique Constraints

Several models use compound unique constraints to enforce business rules at the database level:

| Model | Constraint | Business rule |
|-------|-----------|---------------|
| `Metric` | `[organizationId, key, period]` | One metric value per org/key/period |
| `TemplateVersion` | `[templateId, version]` | No duplicate semver within a template |
| `TemplateInstallation` | `[organizationId, templateId]` | One installation record per org/template |
| `Account` (NextAuth) | `[provider, providerAccountId]` | One OAuth account per provider |

### 4. CSV Export Route Pattern

The leads CSV export follows a clean Route Handler pattern:

```typescript
// src/app/api/portal/leads/export/route.ts
export async function GET() {
  const session = await auth();
  // 1. Auth check
  if (!session?.user.organizationId) return 401;
  
  // 2. Query data (org-scoped)
  const leads = await prisma.lead.findMany({ where: { organizationId, deletedAt: null } });
  
  // 3. Build CSV string with proper escaping
  const csv = buildCsv(leads);
  
  // 4. Return with download headers
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${date}.csv"`,
    },
  });
}
```

The `escapeCsv()` helper wraps values containing commas, quotes, or newlines in double-quotes and doubles any internal quotes (RFC 4180 compliant).

### 5. Client Components for Interactivity

The codebase uses Next.js Server Components by default (no `"use client"` directive). Client Components are used only where interactivity is required:

- `LeadTableClient.tsx` — sortable table with filter state
- `RoiCalculator.tsx` — real-time calculation with local state
- `TemplateFilters.tsx` — filter state management
- `AssistantConfigForm.tsx` — form with react-hook-form
- All dialog components (need DOM event handlers)

This maximizes server-side rendering and reduces client-side JavaScript bundle size.

### 6. WebhookSecret Per Automation

Every `Automation` record has its own `webhookSecret` field (32 random bytes as hex):

```typescript
export function generateWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array); // Web Crypto API (available in Node.js 18+)
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

This allows each automation to have an independent secret for per-automation webhook authentication (reserved for future use; the current implementation uses the platform-level `N8N_WEBHOOK_SECRET` for all inbound webhooks).

---

## 18. Extending the Platform

### How to Add a New Webhook Route

To add a new inbound webhook (e.g., `/api/webhooks/n8n/appointments`):

1. **Create the route file:**
   ```
   src/app/api/webhooks/n8n/appointments/route.ts
   ```

2. **Use the standard reliability pattern:**
   ```typescript
   import { NextRequest, NextResponse } from "next/server";
   import { prisma } from "@/lib/prisma";
   import { verifyWebhookSignature } from "@/lib/webhook-validator";

   const WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET ?? "";

   export async function POST(req: NextRequest) {
     const signature = req.headers.get("x-reymen-signature") ?? "";
     const orgId = req.headers.get("x-reymen-orgid") ?? "";
     const rawBody = await req.text();

     // 1. Verify HMAC
     if (!verifyWebhookSignature(rawBody, signature, WEBHOOK_SECRET)) {
       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
     }

     // 2. Store event (reliability pattern)
     const webhookEvent = await prisma.webhookEvent.create({
       data: {
         organizationId: orgId,
         source: "n8n",
         eventType: "appointment.created", // new event type
         payload: JSON.parse(rawBody),
         status: "PROCESSING",
       },
     });

     try {
       // 3. Parse and validate
       const payload = JSON.parse(rawBody) as { /* your fields */ };

       // 4. Business logic
       await prisma.appointment.create({ data: { organizationId: orgId, ... } });

       // 5. Mark as processed
       await prisma.webhookEvent.update({
         where: { id: webhookEvent.id },
         data: { status: "PROCESSED", processedAt: new Date() },
       });

       return NextResponse.json({ success: true });
     } catch (error) {
       await prisma.webhookEvent.update({
         where: { id: webhookEvent.id },
         data: { status: "FAILED", errorMessage: error?.message },
       });
       return NextResponse.json({ error: "Processing failed" }, { status: 500 });
     }
   }
   ```

3. **Document the route** in `src/app/(admin)/admin/api-docs/page.tsx`.
4. **Configure n8n** to call the new endpoint with the HMAC signature.

No middleware changes are needed — webhook routes are automatically public (matched by `pathname.startsWith("/api/webhooks")`).

---

### How to Add a New Portal Page

1. **Create the page file** following the route group convention:
   ```
   src/app/(portal)/portal/my-feature/page.tsx
   ```

2. **Make it a Server Component** (no `"use client"`). Fetch data server-side:
   ```typescript
   import { auth } from "@/lib/auth";
   import { redirect } from "next/navigation";
   import { prisma } from "@/lib/prisma";

   export default async function MyFeaturePage() {
     const session = await auth();
     if (!session?.user.organizationId) redirect("/login");

     const data = await prisma.myModel.findMany({
       where: { organizationId: session.user.organizationId },
     });

     return (
       <div>
         {/* Render your data */}
       </div>
     );
   }
   ```

3. **Add the navigation link** to `src/components/portal/PortalSidebar.tsx`.

4. **Check permissions** if the page should be restricted by role:
   ```typescript
   import { can } from "@/lib/permissions";
   if (!can(session.user.role, "my_permission")) redirect("/portal/dashboard");
   ```

5. **Create Server Actions** in `src/actions/my-feature.ts` for any mutations. Follow the existing pattern: auth check → org scope → Prisma mutation → revalidatePath → return result.

6. **Add Client Components** (with `"use client"`) only for interactive parts (forms, dialogs, toggles). Import and use them inside your Server Component.

---

### How to Add a New Permission

1. **Add the action to the `Action` type** in `src/lib/permissions.ts`:
   ```typescript
   type Action =
     | "leads:create"
     | ... (existing)
     | "my_feature:manage"  // new
     | "my_feature:view";   // new
   ```

2. **Add the action to each role's permission array**:
   ```typescript
   const ROLE_PERMISSIONS: Record<UserRole, Action[]> = {
     SUPER_ADMIN: [ ...existing, "my_feature:manage", "my_feature:view" ],
     ADMIN:       [ ...existing, "my_feature:manage", "my_feature:view" ],
     OWNER:       [ ...existing, "my_feature:manage", "my_feature:view" ],
     MANAGER:     [ ...existing, "my_feature:view" ],
     AGENT:       [ ...existing ],
     VIEWER:      [ ...existing ],
     CLIENT:      [ ...existing ],
   };
   ```

3. **Use the permission in your Server Action:**
   ```typescript
   import { can } from "@/lib/permissions";
   import type { UserRole } from "@prisma/client";

   export async function myFeatureAction() {
     const session = await auth();
     if (!can(session.user.role as UserRole, "my_feature:manage")) {
       throw new Error("Sin permisos");
     }
     // ... action logic
   }
   ```

4. **Conditionally render UI** based on permission (use session role in Server Components):
   ```typescript
   const canManage = can(session.user.role, "my_feature:manage");
   // { canManage && <MyButton /> }
   ```

No database migration is needed — permissions are fully code-defined.

---

*End of Technical Documentation — Reymen AI OPS Platform v1.0*

*For questions: engineering@reymen.io*
