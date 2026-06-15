-- Add ML breakout probability field to writer_producer_rising_scores.
-- Populated daily by ml/score_writer_producer_daily.py after the XGBoost
-- writer/producer model runs inference.  NULL = no prediction yet (neutral).

ALTER TABLE "writer_producer_rising_scores"
  ADD COLUMN "mlBreakoutProb30d" DOUBLE PRECISION;
