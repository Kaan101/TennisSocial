-- CreateTable
CREATE TABLE "CourtSlotPerson" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtSlotPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtSlotGroup" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtSlotGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourtSlotPerson_courtId_date_startTime_idx" ON "CourtSlotPerson"("courtId", "date", "startTime");

-- CreateIndex
CREATE INDEX "CourtSlotPerson_userId_idx" ON "CourtSlotPerson"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CourtSlotPerson_courtId_date_startTime_userId_key" ON "CourtSlotPerson"("courtId", "date", "startTime", "userId");

-- CreateIndex
CREATE INDEX "CourtSlotGroup_courtId_date_startTime_idx" ON "CourtSlotGroup"("courtId", "date", "startTime");

-- CreateIndex
CREATE INDEX "CourtSlotGroup_groupId_idx" ON "CourtSlotGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "CourtSlotGroup_courtId_date_startTime_groupId_key" ON "CourtSlotGroup"("courtId", "date", "startTime", "groupId");

-- AddForeignKey
ALTER TABLE "CourtSlotPerson" ADD CONSTRAINT "CourtSlotPerson_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSlotPerson" ADD CONSTRAINT "CourtSlotPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSlotGroup" ADD CONSTRAINT "CourtSlotGroup_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSlotGroup" ADD CONSTRAINT "CourtSlotGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
