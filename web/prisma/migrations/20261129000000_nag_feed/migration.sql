-- AlterTable
ALTER TABLE "FocusSession" ADD COLUMN     "checkins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastCheckinAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "nagCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nagNextAt" TIMESTAMP(3),
ADD COLUMN     "snoozeCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FeedItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "channel" TEXT,
    "taskId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedItem_at_idx" ON "FeedItem"("at");

-- CreateIndex
CREATE INDEX "FeedItem_kind_at_idx" ON "FeedItem"("kind", "at");

-- CreateIndex
CREATE INDEX "Task_nagNextAt_idx" ON "Task"("nagNextAt");

