-- Merdiven listesi görünümü ve teklif pencereleri kulüp merdiven kaydında tutulur.

ALTER TABLE "Ladder" ADD COLUMN "showOfferingPlayer" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Ladder" ADD COLUMN "showChallengeResult" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Ladder" ADD COLUMN "acceptDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Ladder" ADD COLUMN "responseHours" INTEGER NOT NULL DEFAULT 48;
