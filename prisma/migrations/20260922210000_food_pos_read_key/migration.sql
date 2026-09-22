-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "foodPosReadKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_foodPosReadKey_key" ON "Organization"("foodPosReadKey");
