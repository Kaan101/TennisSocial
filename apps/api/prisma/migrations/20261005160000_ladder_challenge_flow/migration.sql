-- A challenge needs an answer, an acceptance, and a match date.
-- A missed window is read from these times. Nothing here schedules it.
-- lastMoveSteps is how many seats the last result moved. Older rows stay empty.

ALTER TYPE "MatchOfferStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "MatchOfferStatus" ADD VALUE 'REJECTED';
ALTER TYPE "MatchOfferStatus" ADD VALUE 'SCHEDULED';

ALTER TABLE "MatchOffer" ADD COLUMN "respondedAt" TIMESTAMP(3);
ALTER TABLE "MatchOffer" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "MatchOffer" ADD COLUMN "scheduledAt" TIMESTAMP(3);

ALTER TABLE "LadderPlayer" ADD COLUMN "lastMoveSteps" INTEGER;
