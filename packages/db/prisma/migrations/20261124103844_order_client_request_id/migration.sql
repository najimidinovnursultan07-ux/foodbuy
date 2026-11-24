-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "clientRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_restaurantId_clientRequestId_key" ON "Order"("restaurantId", "clientRequestId");

