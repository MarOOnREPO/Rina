-- CreateTable
CREATE TABLE "Partnership" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partnership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Partnership_userAId_userBId_key" ON "Partnership"("userAId", "userBId");

-- CreateIndex
CREATE INDEX "Partnership_userAId_idx" ON "Partnership"("userAId");

-- CreateIndex
CREATE INDEX "Partnership_userBId_idx" ON "Partnership"("userBId");

-- AddForeignKey
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Partnership" ADD CONSTRAINT "Partnership_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
