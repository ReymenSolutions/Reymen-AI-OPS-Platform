-- DropForeignKey
ALTER TABLE "FoodDishIngredient" DROP CONSTRAINT "FoodDishIngredient_dishId_fkey";

-- DropForeignKey
ALTER TABLE "FoodDishIngredient" DROP CONSTRAINT "FoodDishIngredient_inventoryItemId_fkey";

-- DropForeignKey
ALTER TABLE "FoodDishSale" DROP CONSTRAINT "FoodDishSale_dishId_fkey";

-- DropIndex
DROP INDEX "FoodDishSale_dishId_occurredAt_key";

-- AlterTable
ALTER TABLE "FoodDish" DROP COLUMN "price";

-- AlterTable
ALTER TABLE "FoodDishSale" DROP COLUMN "dishId",
ADD COLUMN     "variantId" TEXT NOT NULL;

-- DropTable
DROP TABLE "FoodDishIngredient";

-- CreateTable
CREATE TABLE "FoodDishVariant" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodDishVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodDishVariantIngredient" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "FoodDishVariantIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodDishVariant_dishId_idx" ON "FoodDishVariant"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodDishVariant_dishId_label_key" ON "FoodDishVariant"("dishId", "label");

-- CreateIndex
CREATE INDEX "FoodDishVariantIngredient_variantId_idx" ON "FoodDishVariantIngredient"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodDishVariantIngredient_variantId_inventoryItemId_key" ON "FoodDishVariantIngredient"("variantId", "inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodDishSale_variantId_occurredAt_key" ON "FoodDishSale"("variantId", "occurredAt");

-- AddForeignKey
ALTER TABLE "FoodDishVariant" ADD CONSTRAINT "FoodDishVariant_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "FoodDish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodDishVariantIngredient" ADD CONSTRAINT "FoodDishVariantIngredient_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "FoodDishVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodDishVariantIngredient" ADD CONSTRAINT "FoodDishVariantIngredient_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "FoodInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodDishSale" ADD CONSTRAINT "FoodDishSale_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "FoodDishVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

