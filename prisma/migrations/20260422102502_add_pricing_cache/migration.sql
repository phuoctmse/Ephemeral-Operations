-- CreateTable
CREATE TABLE "PricingCache" (
    "id" TEXT NOT NULL,
    "instanceType" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "hourlyCost" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PricingCache_instanceType_region_key" ON "PricingCache"("instanceType", "region");
