-- AlterTable
ALTER TABLE "Area" ADD COLUMN     "spaceId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "estimateMin" INTEGER,
ADD COLUMN     "spaceId" TEXT;

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'mint',
    "order" INTEGER NOT NULL DEFAULT 0,
    "workHoursOnly" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "FocusSession" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "plannedMin" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Space_slug_key" ON "Space"("slug");

-- CreateIndex
CREATE INDEX "FocusSession_startedAt_idx" ON "FocusSession"("startedAt");

-- CreateIndex
CREATE INDEX "FocusSession_taskId_idx" ON "FocusSession"("taskId");

-- CreateIndex
CREATE INDEX "Task_spaceId_idx" ON "Task"("spaceId");

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Backfill: two starting spaces, then put existing tasks/areas in them ──
INSERT INTO "Space" ("id", "slug", "name", "color", "order", "workHoursOnly", "updatedAt") VALUES
  ('space_personal', 'personal', 'Personal', 'mint', 0, false, CURRENT_TIMESTAMP),
  ('space_work', 'work', 'Work', 'sky', 1, false, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- Work = the firm (IT Firm campaign, ARCNIR/NightOwlDevs site project) + tasks copied from the ARCNIR board.
UPDATE "Area" SET "spaceId" = CASE
  WHEN "name" IN ('IT Firm', 'NightOwlDevs Portfolio Site') THEN 'space_work'
  ELSE 'space_personal' END;

UPDATE "Task" t SET "spaceId" = COALESCE(
  CASE WHEN t."vaultId" LIKE 'arcnir:%' THEN 'space_work' END,
  (SELECT a."spaceId" FROM "Area" a WHERE a."id" = t."areaId"),
  'space_personal');
