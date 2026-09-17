-- CreateTable
CREATE TABLE "TemplatePackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "iconEmoji" TEXT NOT NULL DEFAULT '📦',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplatePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplatePackageItem" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TemplatePackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplatePackage_industry_idx" ON "TemplatePackage"("industry");

-- CreateIndex
CREATE INDEX "TemplatePackage_isPublished_idx" ON "TemplatePackage"("isPublished");

-- CreateIndex
CREATE INDEX "TemplatePackageItem_packageId_idx" ON "TemplatePackageItem"("packageId");

-- CreateIndex
CREATE INDEX "TemplatePackageItem_templateId_idx" ON "TemplatePackageItem"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplatePackageItem_packageId_templateId_key" ON "TemplatePackageItem"("packageId", "templateId");

-- AddForeignKey
ALTER TABLE "TemplatePackageItem" ADD CONSTRAINT "TemplatePackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TemplatePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplatePackageItem" ADD CONSTRAINT "TemplatePackageItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AutomationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
