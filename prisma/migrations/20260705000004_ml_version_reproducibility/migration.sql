-- Reproducibility ledger: code commit + training-set hash per model version.
ALTER TABLE "ml_model_versions"
    ADD COLUMN "codeSha" TEXT,
    ADD COLUMN "datasetHash" TEXT;
