-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "exchangeRateDate" TIMESTAMP(3),
ADD COLUMN     "fcfaEquivalent" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "ProjectPart" ADD COLUMN     "fcfaEquivalent" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "sourceCurrency" TEXT NOT NULL,
    "targetCurrency" TEXT NOT NULL,
    "rate" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_date_idx" ON "ExchangeRate"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_sourceCurrency_targetCurrency_date_key" ON "ExchangeRate"("sourceCurrency", "targetCurrency", "date");
