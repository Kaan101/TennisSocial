-- CreateTable
CREATE TABLE "LadderRematchLock" (
    "id" TEXT NOT NULL,
    "ladderId" TEXT NOT NULL,
    "challengerUserId" TEXT NOT NULL,
    "lockedOpponentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LadderRematchLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LadderRematchLock_ladderId_challengerUserId_lockedOpponentId_key" ON "LadderRematchLock"("ladderId", "challengerUserId", "lockedOpponentId");

-- CreateIndex
CREATE INDEX "LadderRematchLock_ladderId_challengerUserId_idx" ON "LadderRematchLock"("ladderId", "challengerUserId");

-- AddForeignKey
ALTER TABLE "LadderRematchLock" ADD CONSTRAINT "LadderRematchLock_ladderId_fkey" FOREIGN KEY ("ladderId") REFERENCES "Ladder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
