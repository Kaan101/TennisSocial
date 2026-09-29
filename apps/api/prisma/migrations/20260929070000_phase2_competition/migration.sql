-- CreateEnum
CREATE TYPE "TournamentDivision" AS ENUM ('SINGLES', 'DOUBLES', 'MIXED');

-- CreateEnum
CREATE TYPE "TournamentPlayerStatus" AS ENUM ('REGISTERED', 'WAITING_LIST', 'CONFIRMED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TournamentStage" AS ENUM ('GROUP', 'KNOCKOUT', 'AMERICANO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ANNOUNCEMENT_CREATE';
ALTER TYPE "AuditAction" ADD VALUE 'ANNOUNCEMENT_UPDATE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_OPENED';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_MATCH_ASSIGNED';

-- AlterEnum
ALTER TYPE "TournamentFormat" ADD VALUE 'AMERICANO';

-- DropIndex
DROP INDEX "TournamentMatch_tournamentId_round_position_key";

-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN     "ladderId" TEXT;

-- AlterTable
ALTER TABLE "Ladder" ADD COLUMN     "maxRankSpan" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "ladderId" TEXT;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "courts" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "division" "TournamentDivision" NOT NULL DEFAULT 'SINGLES',
ADD COLUMN     "groupSize" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "maxLevel" "OverallLevel",
ADD COLUMN     "maxPlayers" INTEGER,
ADD COLUMN     "minLevel" "OverallLevel",
ADD COLUMN     "pointsLoss" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsWin" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "qualifiersPerGroup" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "registrationDeadline" TIMESTAMP(3),
ADD COLUMN     "rules" TEXT,
ADD COLUMN     "setFormat" "SetFormat" NOT NULL DEFAULT 'BEST_OF_3';

-- AlterTable
ALTER TABLE "TournamentMatch" ADD COLUMN     "groupKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "playerAPartnerId" TEXT,
ADD COLUMN     "playerBPartnerId" TEXT,
ADD COLUMN     "stage" "TournamentStage" NOT NULL DEFAULT 'KNOCKOUT';

-- AlterTable
ALTER TABLE "TournamentPlayer" ADD COLUMN     "status" "TournamentPlayerStatus" NOT NULL DEFAULT 'REGISTERED';

-- CreateIndex
CREATE INDEX "Challenge_ladderId_idx" ON "Challenge"("ladderId");

-- CreateIndex
CREATE INDEX "Match_ladderId_idx" ON "Match"("ladderId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentMatch_tournamentId_stage_groupKey_round_position_key" ON "TournamentMatch"("tournamentId", "stage", "groupKey", "round", "position");

-- CreateIndex
CREATE INDEX "TournamentPlayer_tournamentId_status_idx" ON "TournamentPlayer"("tournamentId", "status");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_ladderId_fkey" FOREIGN KEY ("ladderId") REFERENCES "Ladder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_ladderId_fkey" FOREIGN KEY ("ladderId") REFERENCES "Ladder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_playerAPartnerId_fkey" FOREIGN KEY ("playerAPartnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_playerBPartnerId_fkey" FOREIGN KEY ("playerBPartnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

