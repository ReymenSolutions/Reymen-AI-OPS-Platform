-- AlterTable: add columns nullable first so existing rows don't break
ALTER TABLE "FoodDishVariant" ADD COLUMN     "externalPosId" TEXT,
ADD COLUMN     "organizationId" TEXT;

-- Backfill organizationId from the parent FoodDish for existing rows
UPDATE "FoodDishVariant" v
SET "organizationId" = d."organizationId"
FROM "FoodDish" d
WHERE v."dishId" = d."id";

-- Now that every row has a value, enforce NOT NULL
ALTER TABLE "FoodDishVariant" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "FoodDishVariant_organizationId_idx" ON "FoodDishVariant"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodDishVariant_organizationId_externalPosId_key" ON "FoodDishVariant"("organizationId", "externalPosId");

-- AddForeignKey
ALTER TABLE "FoodDishVariant" ADD CONSTRAINT "FoodDishVariant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
