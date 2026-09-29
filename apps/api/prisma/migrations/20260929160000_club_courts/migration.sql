-- CreateEnum
CREATE TYPE "CourtKind" AS ENUM ('BALLOON', 'OUTDOOR');

-- AlterTable
ALTER TABLE "Court" ADD COLUMN "kind" "CourtKind" NOT NULL DEFAULT 'OUTDOOR',
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Court_sortOrder_idx" ON "Court"("sortOrder");

-- Kapalı 1–3 are balloon courts (kind BALLOON). Kort 1–9 are outdoor.
-- Insert only when that name is missing so a second deploy does not duplicate rows.
INSERT INTO "Court" ("id", "name", "active", "kind", "sortOrder", "createdAt", "updatedAt")
SELECT v.id, v.name, true, v.kind, v.sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('club-kapali-1'::text, 'Kapalı 1'::text, 'BALLOON'::"CourtKind", 1),
    ('club-kapali-2'::text, 'Kapalı 2'::text, 'BALLOON'::"CourtKind", 2),
    ('club-kapali-3'::text, 'Kapalı 3'::text, 'BALLOON'::"CourtKind", 3),
    ('club-kort-1'::text, 'Kort 1'::text, 'OUTDOOR'::"CourtKind", 4),
    ('club-kort-2'::text, 'Kort 2'::text, 'OUTDOOR'::"CourtKind", 5),
    ('club-kort-3'::text, 'Kort 3'::text, 'OUTDOOR'::"CourtKind", 6),
    ('club-kort-4'::text, 'Kort 4'::text, 'OUTDOOR'::"CourtKind", 7),
    ('club-kort-5'::text, 'Kort 5'::text, 'OUTDOOR'::"CourtKind", 8),
    ('club-kort-6'::text, 'Kort 6'::text, 'OUTDOOR'::"CourtKind", 9),
    ('club-kort-7'::text, 'Kort 7'::text, 'OUTDOOR'::"CourtKind", 10),
    ('club-kort-8'::text, 'Kort 8'::text, 'OUTDOOR'::"CourtKind", 11),
    ('club-kort-9'::text, 'Kort 9'::text, 'OUTDOOR'::"CourtKind", 12)
) AS v(id, name, kind, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "Court" c WHERE c."name" = v.name AND c."deletedAt" IS NULL
);

UPDATE "Court" AS c
SET "kind" = v.kind,
    "sortOrder" = v.sort_order,
    "updatedAt" = CURRENT_TIMESTAMP
FROM (
  VALUES
    ('Kapalı 1'::text, 'BALLOON'::"CourtKind", 1),
    ('Kapalı 2'::text, 'BALLOON'::"CourtKind", 2),
    ('Kapalı 3'::text, 'BALLOON'::"CourtKind", 3),
    ('Kort 1'::text, 'OUTDOOR'::"CourtKind", 4),
    ('Kort 2'::text, 'OUTDOOR'::"CourtKind", 5),
    ('Kort 3'::text, 'OUTDOOR'::"CourtKind", 6),
    ('Kort 4'::text, 'OUTDOOR'::"CourtKind", 7),
    ('Kort 5'::text, 'OUTDOOR'::"CourtKind", 8),
    ('Kort 6'::text, 'OUTDOOR'::"CourtKind", 9),
    ('Kort 7'::text, 'OUTDOOR'::"CourtKind", 10),
    ('Kort 8'::text, 'OUTDOOR'::"CourtKind", 11),
    ('Kort 9'::text, 'OUTDOOR'::"CourtKind", 12)
) AS v(name, kind, sort_order)
WHERE c."name" = v.name AND c."deletedAt" IS NULL;
