-- Self-hosted error tracking: aggregated-by-fingerprint error events.

-- CreateTable
CREATE TABLE "error_events" (
    "id" SERIAL NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "method" TEXT,
    "statusCode" INTEGER NOT NULL DEFAULT 500,
    "errorName" TEXT,
    "message" TEXT NOT NULL,
    "stackSample" TEXT,
    "tenantId" INTEGER,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "error_events_fingerprint_key" ON "error_events"("fingerprint");
CREATE INDEX "error_events_lastSeenAt_idx" ON "error_events"("lastSeenAt");
CREATE INDEX "error_events_statusCode_idx" ON "error_events"("statusCode");
