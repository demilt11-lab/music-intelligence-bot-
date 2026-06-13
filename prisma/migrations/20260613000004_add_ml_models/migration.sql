-- CreateTable
CREATE TABLE "ml_models" (
    "id" SERIAL NOT NULL,
    "modelType" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "weights" JSONB NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "nSamples" INTEGER NOT NULL,
    "trainedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_models_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ml_models_modelType_key" ON "ml_models"("modelType");
