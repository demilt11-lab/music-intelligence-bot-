-- Migration: watchlist, alerts, notifications
-- RLS: each user can only access their own rows.
-- Prisma manages the actual schema; this file sets up RLS policies for Supabase.

-- ─────────────────────────────────────────
-- watchlist
-- ─────────────────────────────────────────
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "watchlist_select_own" ON watchlist
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "watchlist_insert_own" ON watchlist
  FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "watchlist_update_own" ON watchlist
  FOR UPDATE USING (user_id = auth.uid()::text);

CREATE POLICY "watchlist_delete_own" ON watchlist
  FOR DELETE USING (user_id = auth.uid()::text);

-- ─────────────────────────────────────────
-- alerts
-- ─────────────────────────────────────────
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts_select_own" ON alerts
  FOR SELECT USING (user_id = auth.uid()::text);

-- Alerts are inserted by server-side cron (service role bypasses RLS).
-- Users can only update read/resolved status on their own alerts.
CREATE POLICY "alerts_update_own" ON alerts
  FOR UPDATE USING (user_id = auth.uid()::text);

-- ─────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (user_id = auth.uid()::text);

-- Index hints for common query patterns
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_user_unread ON alerts(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON notifications(user_id, status);
