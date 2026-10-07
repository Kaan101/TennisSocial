-- Merdiven defi maçlarını normal maçlardan ayır.

CREATE TYPE "MatchKind" AS ENUM ('NORMAL', 'DEFI');

ALTER TABLE "Match" ADD COLUMN "kind" "MatchKind" NOT NULL DEFAULT 'NORMAL';
