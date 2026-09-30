-- AlterTable
ALTER TABLE "FoodRecipeUsage" ADD COLUMN     "modifierOptionId" TEXT,
ALTER COLUMN "variantId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "FoodModifierOptionIngredient" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "FoodModifierOptionIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodModifierOptionIngredient_optionId_idx" ON "FoodModifierOptionIngredient"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodModifierOptionIngredient_optionId_inventoryItemId_key" ON "FoodModifierOptionIngredient"("optionId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "FoodRecipeUsage_modifierOptionId_idx" ON "FoodRecipeUsage"("modifierOptionId");

-- AddForeignKey
ALTER TABLE "FoodModifierOptionIngredient" ADD CONSTRAINT "FoodModifierOptionIngredient_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "FoodModifierOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodModifierOptionIngredient" ADD CONSTRAINT "FoodModifierOptionIngredient_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "FoodInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodRecipeUsage" ADD CONSTRAINT "FoodRecipeUsage_modifierOptionId_fkey" FOREIGN KEY ("modifierOptionId") REFERENCES "FoodModifierOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Cada consumo es de una variante o de una opción de modificador, nunca de ambas ni de ninguna.
ALTER TABLE "FoodRecipeUsage" ADD CONSTRAINT "FoodRecipeUsage_one_source_check"
  CHECK (("variantId" IS NULL) <> ("modifierOptionId" IS NULL));
