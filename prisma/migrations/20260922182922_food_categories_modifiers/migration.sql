-- AlterTable
ALTER TABLE "FoodDish" ADD COLUMN     "categoryId" TEXT;

-- CreateTable
CREATE TABLE "FoodDishCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodDishCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodModifierGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodModifierOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FoodModifierOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodDishModifierGroup" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "FoodDishModifierGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodDishCategory_organizationId_idx" ON "FoodDishCategory"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodDishCategory_organizationId_name_key" ON "FoodDishCategory"("organizationId", "name");

-- CreateIndex
CREATE INDEX "FoodModifierGroup_organizationId_idx" ON "FoodModifierGroup"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodModifierGroup_organizationId_name_key" ON "FoodModifierGroup"("organizationId", "name");

-- CreateIndex
CREATE INDEX "FoodModifierOption_groupId_idx" ON "FoodModifierOption"("groupId");

-- CreateIndex
CREATE INDEX "FoodDishModifierGroup_dishId_idx" ON "FoodDishModifierGroup"("dishId");

-- CreateIndex
CREATE INDEX "FoodDishModifierGroup_groupId_idx" ON "FoodDishModifierGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodDishModifierGroup_dishId_groupId_key" ON "FoodDishModifierGroup"("dishId", "groupId");

-- CreateIndex
CREATE INDEX "FoodDish_categoryId_idx" ON "FoodDish"("categoryId");

-- AddForeignKey
ALTER TABLE "FoodDishCategory" ADD CONSTRAINT "FoodDishCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodDish" ADD CONSTRAINT "FoodDish_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FoodDishCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodModifierGroup" ADD CONSTRAINT "FoodModifierGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodModifierOption" ADD CONSTRAINT "FoodModifierOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FoodModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodDishModifierGroup" ADD CONSTRAINT "FoodDishModifierGroup_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "FoodDish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodDishModifierGroup" ADD CONSTRAINT "FoodDishModifierGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FoodModifierGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

