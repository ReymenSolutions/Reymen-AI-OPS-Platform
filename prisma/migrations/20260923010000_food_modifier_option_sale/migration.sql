-- CreateTable
CREATE TABLE "FoodModifierOptionSale" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodModifierOptionSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodModifierOptionSale_organizationId_occurredAt_idx" ON "FoodModifierOptionSale"("organizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "FoodModifierOptionSale_optionId_occurredAt_key" ON "FoodModifierOptionSale"("optionId", "occurredAt");

-- AddForeignKey
ALTER TABLE "FoodModifierOptionSale" ADD CONSTRAINT "FoodModifierOptionSale_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
