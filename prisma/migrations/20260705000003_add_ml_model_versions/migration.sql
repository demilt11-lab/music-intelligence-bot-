-- Append-only ML model version archive for one-step rollback.

-- CreateTable
CREATE TABLE "ml_model_versions" (
    "id" SERIAL NOT NULL,
    "modelType" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "weights" JSONB NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "nSamples" INTEGER NOT NULL,
    "trainedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ml_model_versions_modelType_version_key" ON "ml_model_versions"("modelType", "version");
CREATE INDEX "ml_model_versions_modelType_createdAt_idx" ON "ml_model_versions"("modelType", "createdAt");
