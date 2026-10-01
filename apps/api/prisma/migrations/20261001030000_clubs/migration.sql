-- Clubs own courts. Start empty: remove every current court and the reservations on it,
-- including the seeded Kapalı 1–3 and Kort 1–9. Do not insert a club or those courts.

DELETE FROM "SlotOffer" WHERE "reservationId" IS NOT NULL;

DELETE FROM "CourtReservation";

DELETE FROM "Court";

CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasRestaurant" BOOLEAN NOT NULL DEFAULT false,
    "hasFitness" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Court" ADD COLUMN "clubId" TEXT NOT NULL;

CREATE INDEX "Court_clubId_idx" ON "Court"("clubId");

ALTER TABLE "Court" ADD CONSTRAINT "Court_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
