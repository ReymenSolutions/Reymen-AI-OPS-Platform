-- CreateEnum
CREATE TYPE "FoodInventoryCategory" AS ENUM ('EDIBLE', 'NON_EDIBLE');

-- AlterTable
ALTER TABLE "FoodInventoryItem" ADD COLUMN     "category" "FoodInventoryCategory" NOT NULL DEFAULT 'EDIBLE';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "foodTargetCostPct" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "FoodDish" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodDish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodDishIngredient" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "FoodDishIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodDishSale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodDishSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodOperatingCost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountMonthly" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodOperatingCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodDish_organizationId_idx" ON "FoodDish"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodDish_organizationId_name_key" ON "FoodDish"("organizationId", "name");

-- CreateIndex
CREATE INDEX "FoodDishIngredient_dishId_idx" ON "FoodDishIngredient"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodDishIngredient_dishId_inventoryItemId_key" ON "FoodDishIngredient"("dishId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "FoodDishSale_organizationId_occurredAt_idx" ON "FoodDishSale"("organizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "FoodDishSale_dishId_occurredAt_key" ON "FoodDishSale"("dishId", "occurredAt");

-- CreateIndex
CREATE INDEX "FoodOperatingCost_organizationId_idx" ON "FoodOperatingCost"("organizationId");

-- AddForeignKey
ALTER TABLE "FoodDish" ADD CONSTRAINT "FoodDish_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodDishIngredient" ADD CONSTRAINT "FoodDishIngredient_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "FoodDish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodDishIngredient" ADD CONSTRAINT "FoodDishIngredient_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "FoodInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodDishSale" ADD CONSTRAINT "FoodDishSale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodDishSale" ADD CONSTRAINT "FoodDishSale_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "FoodDish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodOperatingCost" ADD CONSTRAINT "FoodOperatingCost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
