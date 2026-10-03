-- CreateIndex
CREATE INDEX "Absence_userId_deletedAt_idx" ON "Absence"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Availability_userId_deletedAt_kind_date_idx" ON "Availability"("userId", "deletedAt", "kind", "date");

-- CreateIndex
CREATE INDEX "Court_clubId_deletedAt_active_sortOrder_name_idx" ON "Court"("clubId", "deletedAt", "active", "sortOrder", "name");

-- CreateIndex
CREATE INDEX "CourtReservation_deletedAt_status_endDate_startDate_idx" ON "CourtReservation"("deletedAt", "status", "endDate", "startDate");

-- CreateIndex
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

-- CreateIndex
CREATE INDEX "User_deletedAt_boardVisible_idx" ON "User"("deletedAt", "boardVisible");
