-- Adds indexes flagged by the launch-readiness audit as missing on tables
-- that were already hot query paths in production: RequestLog (written on
-- every v1 API call, read by two usage-summary endpoints), AlertRule and
-- DigestSubscription (swept by their respective crons across all tenants
-- on every run), and ApiKey (listed per-tenant on the settings page).
-- All additive — no data changes, no constraint tightening.

-- RequestLog
CREATE INDEX "RequestLog_tenantId_createdAt_idx" ON "RequestLog"("tenantId", "createdAt");
CREATE INDEX "RequestLog_tenantId_endpoint_idx" ON "RequestLog"("tenantId", "endpoint");

-- AlertRule
CREATE INDEX "alert_rules_tenantId_idx" ON "alert_rules"("tenantId");
CREATE INDEX "alert_rules_isActive_idx" ON "alert_rules"("isActive");

-- DigestSubscription
CREATE INDEX "digest_subscriptions_isActive_frequency_idx" ON "digest_subscriptions"("isActive", "frequency");

-- ApiKey
CREATE INDEX "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");
