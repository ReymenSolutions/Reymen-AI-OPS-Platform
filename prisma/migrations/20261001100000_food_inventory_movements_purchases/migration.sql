-- CreateEnum
CREATE TYPE "FoodInventoryMovementType" AS ENUM ('SALE', 'SALE_CANCELLATION', 'MANUAL_DISH_SALES', 'PURCHASE', 'PURCHASE_VOID', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "FoodInventoryItem" ALTER COLUMN "currentStock" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "minStock" SET DATA TYPE DECIMAL(12,3);

-- CreateTable
CREATE TABLE "FoodInventoryMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "type" "FoodInventoryMovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "stockAfter" DECIMAL(12,3) NOT NULL,
    "foodSaleId" TEXT,
    "purchaseId" TEXT,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodInventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodPurchase" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "supplierId" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "userId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodPurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "FoodPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodInventoryMovement_organizationId_createdAt_idx" ON "FoodInventoryMovement"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "FoodInventoryMovement_inventoryItemId_createdAt_idx" ON "FoodInventoryMovement"("inventoryItemId", "createdAt");

-- CreateIndex
CREATE INDEX "FoodPurchase_organizationId_purchasedAt_idx" ON "FoodPurchase"("organizationId", "purchasedAt");

-- CreateIndex
CREATE INDEX "FoodPurchaseItem_purchaseId_idx" ON "FoodPurchaseItem"("purchaseId");

-- CreateIndex
CREATE INDEX "FoodPurchaseItem_inventoryItemId_idx" ON "FoodPurchaseItem"("inventoryItemId");

-- AddForeignKey
ALTER TABLE "FoodInventoryMovement" ADD CONSTRAINT "FoodInventoryMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodInventoryMovement" ADD CONSTRAINT "FoodInventoryMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "FoodInventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodPurchase" ADD CONSTRAINT "FoodPurchase_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodPurchase" ADD CONSTRAINT "FoodPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "FoodSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodPurchaseItem" ADD CONSTRAINT "FoodPurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "FoodPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodPurchaseItem" ADD CONSTRAINT "FoodPurchaseItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "FoodInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

