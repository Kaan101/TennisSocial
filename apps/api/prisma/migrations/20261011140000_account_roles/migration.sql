-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('USER', 'OFFICIAL', 'ADMIN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "accountRole" "AccountRole" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "blockedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_accountRole_idx" ON "User"("accountRole");

-- CreateIndex
CREATE INDEX "User_blockedAt_idx" ON "User"("blockedAt");
