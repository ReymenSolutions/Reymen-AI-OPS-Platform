-- Ajustes rápidos de inventario: ingreso de stock, producción de preparados y desecho.
ALTER TYPE "FoodInventoryMovementType" ADD VALUE 'STOCK_IN';
ALTER TYPE "FoodInventoryMovementType" ADD VALUE 'PRODUCTION';
ALTER TYPE "FoodInventoryMovementType" ADD VALUE 'WASTE';

ALTER TABLE "FoodInventoryMovement" ADD COLUMN "batchId" TEXT;
CREATE INDEX "FoodInventoryMovement_batchId_idx" ON "FoodInventoryMovement"("batchId");
