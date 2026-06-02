CREATE TABLE "prediction_outcomes" (
  "id" SERIAL PRIMARY KEY,
  "trackId" INTEGER,
  "artistId" INTEGER,
  "predictionType" TEXT NOT NULL,
  "predictedValue" TEXT NOT NULL,
  "predictedAt" TIMESTAMP NOT NULL,
  "evaluatedAt" TIMESTAMP,
  "actualValue" TEXT,
  "wasCorrect" BOOLEAN,
  "modelName" TEXT NOT NULL,
  "modelVersion" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX ON "prediction_outcomes"("trackId", "predictedAt");
CREATE INDEX ON "prediction_outcomes"("artistId", "predictedAt");
CREATE INDEX ON "prediction_outcomes"("predictionType", "predictedAt");

CREATE TABLE "model_accuracy_reports" (
  "id" SERIAL PRIMARY KEY,
  "modelName" TEXT NOT NULL,
  "evaluationDate" TIMESTAMP NOT NULL,
  "windowDays" INTEGER NOT NULL,
  "totalPredictions" INTEGER NOT NULL,
  "correctPredictions" INTEGER NOT NULL,
  "accuracy" FLOAT NOT NULL,
  "precision" FLOAT,
  "recall" FLOAT,
  "f1Score" FLOAT,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE("modelName", "evaluationDate", "windowDays")
);
