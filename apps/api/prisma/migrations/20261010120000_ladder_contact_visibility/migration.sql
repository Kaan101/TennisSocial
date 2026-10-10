-- CreateEnum
CREATE TYPE "LadderContactVisibility" AS ENUM ('ALWAYS', 'DEFI_ONLY', 'MESSAGE_ONLY');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "ladderContactVisibility" "LadderContactVisibility" NOT NULL DEFAULT 'ALWAYS';
