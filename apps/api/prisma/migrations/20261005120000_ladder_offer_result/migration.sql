-- The seat remembers the last one-place move. The offer remembers its ladder and winner.
-- A pending offer expires from createdAt; nothing here schedules that.

CREATE TYPE "LadderMove" AS ENUM ('UP', 'DOWN');

ALTER TABLE "LadderPlayer" ADD COLUMN "lastMove" "LadderMove";

ALTER TABLE "MatchOffer" ADD COLUMN "ladderId" TEXT;
ALTER TABLE "MatchOffer" ADD COLUMN "winnerId" TEXT;

CREATE INDEX "MatchOffer_ladderId_idx" ON "MatchOffer"("ladderId");

ALTER TABLE "MatchOffer" ADD CONSTRAINT "MatchOffer_ladderId_fkey" FOREIGN KEY ("ladderId") REFERENCES "Ladder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MatchOffer" ADD CONSTRAINT "MatchOffer_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
