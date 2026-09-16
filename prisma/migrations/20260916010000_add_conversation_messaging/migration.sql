-- AlterEnum
ALTER TYPE "MessageRole" ADD VALUE 'AGENT';

-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "assignedToId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "senderId" TEXT,
ADD COLUMN "attachmentUrl" TEXT,
ADD COLUMN "attachmentType" TEXT,
ADD COLUMN "deliveryStatus" "MessageDeliveryStatus";

-- CreateIndex
CREATE INDEX "Conversation_organizationId_assignedToId_idx" ON "Conversation"("organizationId", "assignedToId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
