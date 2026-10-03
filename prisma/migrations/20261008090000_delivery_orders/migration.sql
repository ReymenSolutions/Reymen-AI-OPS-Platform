-- CreateEnum
CREATE TYPE "DeliveryPlatform" AS ENUM ('UBER_EATS', 'RAPPI', 'DIDI_FOOD');

-- CreateEnum
CREATE TYPE "DeliveryOrderStatus" AS ENUM ('NEW', 'ACCEPTED', 'PREPARING', 'READY', 'PICKED_UP', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DeliveryChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "DeliveryPlatform" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "DeliveryPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "status" "DeliveryOrderStatus" NOT NULL DEFAULT 'NEW',
    "customerName" TEXT,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "items" JSONB NOT NULL,
    "notes" TEXT,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "statusAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryChannel_organizationId_platform_key" ON "DeliveryChannel"("organizationId", "platform");

-- CreateIndex
CREATE INDEX "DeliveryOrder_organizationId_placedAt_idx" ON "DeliveryOrder"("organizationId", "placedAt");

-- CreateIndex
CREATE INDEX "DeliveryOrder_organizationId_status_idx" ON "DeliveryOrder"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_organizationId_platform_externalId_key" ON "DeliveryOrder"("organizationId", "platform", "externalId");

-- AddForeignKey
ALTER TABLE "DeliveryChannel" ADD CONSTRAINT "DeliveryChannel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

