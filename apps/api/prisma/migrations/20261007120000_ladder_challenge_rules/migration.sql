-- Defi süreci: pasiflik, teklif edilen sonuç ve onay alanları.

ALTER TABLE "LadderPlayer" ADD COLUMN "passiveUntil" TIMESTAMP(3);

ALTER TABLE "MatchOffer" ADD COLUMN "proposedWinnerId" TEXT;
ALTER TABLE "MatchOffer" ADD COLUMN "resultEnteredAt" TIMESTAMP(3);
ALTER TABLE "MatchOffer" ADD COLUMN "disputedAt" TIMESTAMP(3);
ALTER TABLE "MatchOffer" ADD COLUMN "postponeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MatchOffer" ADD COLUMN "forfeit" BOOLEAN NOT NULL DEFAULT false;
