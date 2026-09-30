-- CreateEnum
CREATE TYPE "AvailabilityState" AS ENUM ('FULL', 'MAYBE', 'BUSY');

-- AlterTable
ALTER TABLE "Availability" ADD COLUMN "state" "AvailabilityState" NOT NULL DEFAULT 'FULL';
