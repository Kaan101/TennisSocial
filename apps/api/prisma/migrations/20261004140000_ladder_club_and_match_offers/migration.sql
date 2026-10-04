-- A ladder can belong to a club. Existing ladders stay, with no club.

ALTER TABLE "Ladder" ADD COLUMN "clubId" TEXT;

CREATE INDEX "Ladder_clubId_idx" ON "Ladder"("clubId");

ALTER TABLE "Ladder" ADD CONSTRAINT "Ladder_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "MatchOfferStatus" AS ENUM ('PENDING');

-- A match offer is the two players, the club, and a pending state.
CREATE TABLE "MatchOffer" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "status" "MatchOfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchOffer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MatchOffer_toUserId_status_idx" ON "MatchOffer"("toUserId", "status");

CREATE INDEX "MatchOffer_fromUserId_idx" ON "MatchOffer"("fromUserId");

CREATE INDEX "MatchOffer_clubId_idx" ON "MatchOffer"("clubId");

ALTER TABLE "MatchOffer" ADD CONSTRAINT "MatchOffer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MatchOffer" ADD CONSTRAINT "MatchOffer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MatchOffer" ADD CONSTRAINT "MatchOffer_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
