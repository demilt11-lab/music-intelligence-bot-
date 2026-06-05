-- Migration: continuous learning tables
-- human_review_items, human_review_decisions, drift_events, model_feature_snapshots
-- Managed by Prisma; this file adds RLS policies only.

-- ─────────────────────────────────────────────
-- human_review_items
-- ─────────────────────────────────────────────
ALTER TABLE human_review_items ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read pending review items (A&R team)
CREATE POLICY "review_select_auth" ON human_review_items
  FOR SELECT TO authenticated USING (true);

-- Only service role inserts (model routing via API)
-- Users cannot self-insert review items

-- ─────────────────────────────────────────────
-- human_review_decisions
-- ─────────────────────────────────────────────
ALTER TABLE human_review_decisions ENABLE ROW LEVEL SECURITY;

-- Reviewers can see their own decisions; team leads can see all (handled at app layer)
CREATE POLICY "review_decision_select" ON human_review_decisions
  FOR SELECT USING (reviewer_id = auth.uid()::text);

-- Reviewers insert their own decisions
CREATE POLICY "review_decision_insert" ON human_review_decisions
  FOR INSERT WITH CHECK (reviewer_id = auth.uid()::text);

-- ─────────────────────────────────────────────
-- drift_events
-- ─────────────────────────────────────────────
ALTER TABLE drift_events ENABLE ROW LEVEL SECURITY;

-- Read-only for all authenticated users (monitoring dashboard)
CREATE POLICY "drift_events_select" ON drift_events
  FOR SELECT TO authenticated USING (true);

-- Only service role inserts drift events (Python drift detector)

-- ─────────────────────────────────────────────
-- model_feature_snapshots
-- ─────────────────────────────────────────────
ALTER TABLE model_feature_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_snapshots_select" ON model_feature_snapshots
  FOR SELECT TO authenticated USING (true);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_human_review_status ON human_review_items(status, enqueued_at);
CREATE INDEX IF NOT EXISTS idx_drift_events_severity ON drift_events(severity, resolved_at);
CREATE INDEX IF NOT EXISTS idx_review_decisions_training ON human_review_decisions(used_in_training, decided_at);
