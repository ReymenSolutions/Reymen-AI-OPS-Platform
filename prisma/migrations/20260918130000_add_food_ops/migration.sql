-- AlterEnum
ALTER TYPE "PlatformModule" ADD VALUE 'FOOD_OPS';

-- CreateTable
CREATE TABLE "FoodSale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT,
    "grossAmount" DECIMAL(10,2) NOT NULL,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodInventoryItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "currentStock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodSupplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodSale_organizationId_idx" ON "FoodSale"("organizationId");

-- CreateIndex
CREATE INDEX "FoodSale_organizationId_occurredAt_idx" ON "FoodSale"("organizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "FoodInventoryItem_organizationId_name_key" ON "FoodInventoryItem"("organizationId", "name");

-- CreateIndex
CREATE INDEX "FoodInventoryItem_organizationId_idx" ON "FoodInventoryItem"("organizationId");

-- CreateIndex
CREATE INDEX "FoodSupplier_organizationId_idx" ON "FoodSupplier"("organizationId");

-- AddForeignKey
ALTER TABLE "FoodSale" ADD CONSTRAINT "FoodSale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodInventoryItem" ADD CONSTRAINT "FoodInventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodSupplier" ADD CONSTRAINT "FoodSupplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
