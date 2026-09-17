-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('RUNNING', 'COMPLETED');

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "changelog" TEXT,
    "createdBy" TEXT,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSandboxSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Sesión de prueba',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSandboxSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSandboxMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "knowledgeBaseContext" TEXT[],
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSandboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTestCase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "promptType" "PromptType" NOT NULL,
    "name" TEXT NOT NULL,
    "userMessage" TEXT NOT NULL,
    "expectedNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTestCaseResult" (
    "id" TEXT NOT NULL,
    "testCaseId" TEXT NOT NULL,
    "promptVersionId" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "knowledgeBaseContext" TEXT[],
    "passed" BOOLEAN,
    "gradedBy" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptTestCaseResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptExperiment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "promptType" "PromptType" NOT NULL,
    "name" TEXT NOT NULL,
    "variantAId" TEXT NOT NULL,
    "variantBId" TEXT NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'RUNNING',
    "winnerVariant" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PromptExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptExperimentSample" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "userMessage" TEXT NOT NULL,
    "replyA" TEXT NOT NULL,
    "replyB" TEXT NOT NULL,
    "preferred" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromptExperimentSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromptVersion_promptId_idx" ON "PromptVersion"("promptId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_promptId_version_key" ON "PromptVersion"("promptId", "version");

-- CreateIndex
CREATE INDEX "AiSandboxSession_organizationId_idx" ON "AiSandboxSession"("organizationId");

-- CreateIndex
CREATE INDEX "AiSandboxMessage_sessionId_idx" ON "AiSandboxMessage"("sessionId");

-- CreateIndex
CREATE INDEX "PromptTestCase_organizationId_idx" ON "PromptTestCase"("organizationId");

-- CreateIndex
CREATE INDEX "PromptTestCase_organizationId_promptType_idx" ON "PromptTestCase"("organizationId", "promptType");

-- CreateIndex
CREATE INDEX "PromptTestCaseResult_testCaseId_idx" ON "PromptTestCaseResult"("testCaseId");

-- CreateIndex
CREATE INDEX "PromptTestCaseResult_promptVersionId_idx" ON "PromptTestCaseResult"("promptVersionId");

-- CreateIndex
CREATE INDEX "PromptExperiment_organizationId_idx" ON "PromptExperiment"("organizationId");

-- CreateIndex
CREATE INDEX "PromptExperiment_organizationId_promptType_idx" ON "PromptExperiment"("organizationId", "promptType");

-- CreateIndex
CREATE INDEX "PromptExperimentSample_experimentId_idx" ON "PromptExperimentSample"("experimentId");

-- AddForeignKey
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSandboxSession" ADD CONSTRAINT "AiSandboxSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSandboxMessage" ADD CONSTRAINT "AiSandboxMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiSandboxSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptTestCase" ADD CONSTRAINT "PromptTestCase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptTestCaseResult" ADD CONSTRAINT "PromptTestCaseResult_testCaseId_fkey" FOREIGN KEY ("testCaseId") REFERENCES "PromptTestCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptTestCaseResult" ADD CONSTRAINT "PromptTestCaseResult_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptExperiment" ADD CONSTRAINT "PromptExperiment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptExperiment" ADD CONSTRAINT "PromptExperiment_variantAId_fkey" FOREIGN KEY ("variantAId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptExperiment" ADD CONSTRAINT "PromptExperiment_variantBId_fkey" FOREIGN KEY ("variantBId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptExperimentSample" ADD CONSTRAINT "PromptExperimentSample_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "PromptExperiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing Prompt gets a version-1 snapshot of its current
-- content, so history/rollback works uniformly for prompts created before
-- this migration and no read path ever sees a prompt with zero versions.
INSERT INTO "PromptVersion" ("id", "promptId", "version", "content", "isLatest", "createdAt")
SELECT gen_random_uuid()::text, "id", 1, "content", true, "updatedAt"
FROM "Prompt";
