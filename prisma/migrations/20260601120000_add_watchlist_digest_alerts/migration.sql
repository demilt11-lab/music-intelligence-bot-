-- CreateTable: watchlist_items
CREATE TABLE IF NOT EXISTS "watchlist_items" (
    "id"         SERIAL PRIMARY KEY,
    "tenantId"   INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId"   INTEGER NOT NULL,
    "notes"      TEXT,
    "addedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "watchlist_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "watchlist_items_tenantId_entityType_entityId_key"
    ON "watchlist_items"("tenantId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "idx_watchlist_tenant_added"
    ON "watchlist_items"("tenantId", "addedAt" DESC);

-- CreateTable: digest_subscriptions
CREATE TABLE IF NOT EXISTS "digest_subscriptions" (
    "id"         SERIAL PRIMARY KEY,
    "tenantId"   INTEGER NOT NULL,
    "email"      TEXT,
    "webhookUrl" TEXT,
    "frequency"  TEXT NOT NULL DEFAULT 'daily',
    "isActive"   BOOLEAN NOT NULL DEFAULT TRUE,
    "lastSentAt" TIMESTAMPTZ,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "digest_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_digest_active_tenant"
    ON "digest_subscriptions"("isActive", "tenantId");

-- CreateTable: alert_rules
CREATE TABLE IF NOT EXISTS "alert_rules" (
    "id"          SERIAL PRIMARY KEY,
    "tenantId"    INTEGER NOT NULL,
    "entityType"  TEXT NOT NULL,
    "entityId"    INTEGER,
    "metric"      TEXT NOT NULL,
    "threshold"   DOUBLE PRECISION NOT NULL,
    "operator"    TEXT NOT NULL DEFAULT 'gt',
    "channel"     TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
    "lastFiredAt" TIMESTAMPTZ,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "alert_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_alert_rules_active_tenant"
    ON "alert_rules"("isActive", "tenantId");
