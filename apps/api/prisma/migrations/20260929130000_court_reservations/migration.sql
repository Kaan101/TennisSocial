-- CreateEnum
CREATE TYPE "CourtPurpose" AS ENUM ('MATCH', 'TRAINING', 'TOURNAMENT', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SlotOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "boardVisible" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SystemParameter" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemParameter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtReservation" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "purpose" "CourtPurpose" NOT NULL,
    "status" "ReservationStatus" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "weekdays" INTEGER[],
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "partnerId" TEXT,
    "note" TEXT,
    "matchId" TEXT,
    "createdById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourtReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationCheckIn" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotOffer" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "status" "SlotOfferStatus" NOT NULL DEFAULT 'PENDING',
    "reservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Court_active_idx" ON "Court"("active");

-- CreateIndex
CREATE INDEX "Court_deletedAt_idx" ON "Court"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourtReservation_matchId_key" ON "CourtReservation"("matchId");

-- CreateIndex
CREATE INDEX "CourtReservation_courtId_status_idx" ON "CourtReservation"("courtId", "status");

-- CreateIndex
CREATE INDEX "CourtReservation_startDate_endDate_idx" ON "CourtReservation"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "CourtReservation_holderId_idx" ON "CourtReservation"("holderId");

-- CreateIndex
CREATE INDEX "CourtReservation_status_idx" ON "CourtReservation"("status");

-- CreateIndex
CREATE INDEX "CourtReservation_deletedAt_idx" ON "CourtReservation"("deletedAt");

-- CreateIndex
CREATE INDEX "ReservationCheckIn_reservationId_date_startTime_idx" ON "ReservationCheckIn"("reservationId", "date", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationCheckIn_reservationId_date_startTime_userId_key" ON "ReservationCheckIn"("reservationId", "date", "startTime", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotOffer_reservationId_key" ON "SlotOffer"("reservationId");

-- CreateIndex
CREATE INDEX "SlotOffer_toUserId_status_idx" ON "SlotOffer"("toUserId", "status");

-- CreateIndex
CREATE INDEX "SlotOffer_fromUserId_status_idx" ON "SlotOffer"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "SlotOffer_date_startTime_idx" ON "SlotOffer"("date", "startTime");

-- AddForeignKey
ALTER TABLE "CourtReservation" ADD CONSTRAINT "CourtReservation_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtReservation" ADD CONSTRAINT "CourtReservation_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtReservation" ADD CONSTRAINT "CourtReservation_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtReservation" ADD CONSTRAINT "CourtReservation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtReservation" ADD CONSTRAINT "CourtReservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtReservation" ADD CONSTRAINT "CourtReservation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationCheckIn" ADD CONSTRAINT "ReservationCheckIn_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "CourtReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationCheckIn" ADD CONSTRAINT "ReservationCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotOffer" ADD CONSTRAINT "SlotOffer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotOffer" ADD CONSTRAINT "SlotOffer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotOffer" ADD CONSTRAINT "SlotOffer_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "CourtReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- System parameter
INSERT INTO "SystemParameter" ("key", "value", "updatedAt") VALUES ('checkInLeadHours', '3', CURRENT_TIMESTAMP);
