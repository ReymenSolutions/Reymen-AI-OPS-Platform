-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "externalId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "externalId" TEXT;

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN "externalEventId" TEXT;

-- CreateIndex
-- Safe on existing data: every pre-existing row has externalId/externalEventId
-- NULL, and Postgres unique indexes treat NULLs as distinct from each other,
-- so this never collides with historical rows — it only starts enforcing
-- uniqueness once a caller actually supplies the idempotency key.
CREATE UNIQUE INDEX "Lead_organizationId_externalId_key" ON "Lead"("organizationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_externalId_key" ON "Message"("conversationId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_organizationId_source_externalEventId_key" ON "WebhookEvent"("organizationId", "source", "externalEventId");
