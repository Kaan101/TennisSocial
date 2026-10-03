-- CreateEnum
CREATE TYPE "TennisType" AS ENUM ('PERFORMANS', 'HOBI', 'VETERAN', 'DIGER');

-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('UNDER_12', 'AGE_12_18', 'AGE_18_35', 'AGE_35_50', 'OVER_50');

-- CreateEnum
CREATE TYPE "PersonProfile" AS ENUM ('OYUNCU', 'ANTRENOR', 'PERSONEL', 'YONETICI', 'DIGER');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "tennisType" "TennisType" NOT NULL DEFAULT 'DIGER';

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "ageGroup" "AgeGroup" NOT NULL DEFAULT 'AGE_18_35';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "tennisType" "TennisType" NOT NULL DEFAULT 'DIGER';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "ageGroup" "AgeGroup" NOT NULL DEFAULT 'AGE_18_35';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "personProfile" "PersonProfile" NOT NULL DEFAULT 'OYUNCU';
