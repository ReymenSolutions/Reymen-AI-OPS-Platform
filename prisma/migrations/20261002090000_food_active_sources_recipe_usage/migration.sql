-- CreateEnum
CREATE TYPE "FoodSaleSource" AS ENUM ('MANUAL', 'POS');

-- AlterEnum
ALTER TYPE "FoodInventoryMovementType" ADD VALUE 'RECIPE_RECALC';

-- AlterTable
ALTER TABLE "FoodInventoryItem" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "FoodPurchaseItem" ADD COLUMN     "previousUnitCost" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "FoodSale" ADD COLUMN     "source" "FoodSaleSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "FoodSupplier" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "FoodRecipeUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "units" DECIMAL(12,3) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "type" "FoodInventoryMovementType" NOT NULL,
    "foodSaleId" TEXT,
    "applied" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodRecipeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodRecipeUsage_organizationId_occurredAt_idx" ON "FoodRecipeUsage"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "FoodRecipeUsage_variantId_idx" ON "FoodRecipeUsage"("variantId");

-- AddForeignKey
ALTER TABLE "FoodRecipeUsage" ADD CONSTRAINT "FoodRecipeUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodRecipeUsage" ADD CONSTRAINT "FoodRecipeUsage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "FoodDishVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Ventas existentes: las capturadas a mano en el portal dejaron un registro
-- de auditoría "food.sale_create"; las demás llegaron por el webhook del POS.
UPDATE "FoodSale" s
SET "source" = 'POS'
WHERE NOT EXISTS (
  SELECT 1 FROM "AuditLog" a
  WHERE a."action" = 'food.sale_create' AND a."resourceId" = s."id"
);
