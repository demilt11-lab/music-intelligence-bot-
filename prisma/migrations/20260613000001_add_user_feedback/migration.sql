-- CreateTable
CREATE TABLE "user_feedback" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "trackId" INTEGER NOT NULL,
    "label" TEXT,
    "isViral" BOOLEAN,
    "isPopular" BOOLEAN,
    "notes" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_feedback_tenantId_createdAt_idx" ON "user_feedback"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "user_feedback_trackId_idx" ON "user_feedback"("trackId");
