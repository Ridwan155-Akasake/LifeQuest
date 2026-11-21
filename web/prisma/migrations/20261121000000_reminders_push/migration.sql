-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "dueTime" TEXT,
ADD COLUMN     "remindAt" TIMESTAMP(3),
ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOkAt" TIMESTAMP(3),
    "failCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "Task_remindAt_idx" ON "Task"("remindAt");

