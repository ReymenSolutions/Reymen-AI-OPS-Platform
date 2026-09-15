-- CreateEnum
CREATE TYPE "PlatformModule" AS ENUM ('CRM', 'AI_WHATSAPP', 'AUTOMATIONS', 'NFC_QR', 'MARKETING_ADS');

-- CreateEnum
CREATE TYPE "ModuleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ModuleSource" AS ENUM ('SUBSCRIBED', 'ADMIN_GRANTED');

-- CreateTable
CREATE TABLE "OrganizationModule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "module" "PlatformModule" NOT NULL,
    "status" "ModuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "ModuleSource" NOT NULL DEFAULT 'SUBSCRIBED',
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationModule_organizationId_idx" ON "OrganizationModule"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationModule_organizationId_module_key" ON "OrganizationModule"("organizationId", "module");

-- AddForeignKey
ALTER TABLE "OrganizationModule" ADD CONSTRAINT "OrganizationModule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every organization that existed before modules were introduced
-- keeps working exactly as before. CRM, AI_WHATSAPP and AUTOMATIONS are the
-- only modules with real functionality as of this migration, so every
-- pre-existing org gets all three, active, marked as already-subscribed
-- (not a new admin grant). Organizations created after this migration start
-- with zero modules until explicitly granted from /admin/clients/[id].
INSERT INTO "OrganizationModule" ("id", "organizationId", "module", "status", "source", "enabledAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", module_value, 'ACTIVE', 'SUBSCRIBED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization", unnest(ARRAY['CRM', 'AI_WHATSAPP', 'AUTOMATIONS']::"PlatformModule"[]) AS module_value;
