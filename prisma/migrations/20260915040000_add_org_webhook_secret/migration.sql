-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "n8nWebhookSecret" TEXT;

-- Backfill existing organizations with a random per-tenant secret. This is a
-- one-time migration-time backfill of a handful of existing rows (not
-- attacker-influenced); every organization created going forward gets a
-- cryptographically random secret from the application layer instead
-- (see generateWebhookSecret() in src/lib/utils.ts).
UPDATE "Organization"
SET "n8nWebhookSecret" = md5(random()::text || clock_timestamp()::text || id) || md5(random()::text || clock_timestamp()::text || id)
WHERE "n8nWebhookSecret" IS NULL;

-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "n8nWebhookSecret" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_n8nWebhookSecret_key" ON "Organization"("n8nWebhookSecret");
