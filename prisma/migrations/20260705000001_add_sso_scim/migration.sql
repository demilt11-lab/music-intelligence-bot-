-- Enterprise identity: SSO (OIDC/SAML) + SCIM 2.0 provisioning.

-- CreateEnum
CREATE TYPE "SsoProtocol" AS ENUM ('OIDC', 'SAML');

-- AlterTable: SSO/SCIM columns on TenantUser
ALTER TABLE "TenantUser"
    ADD COLUMN "externalId" TEXT,
    ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "ssoConnectionId" INTEGER,
    ADD COLUMN "provisionedVia" TEXT NOT NULL DEFAULT 'password';

-- CreateTable
CREATE TABLE "SsoConnection" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "protocol" "SsoProtocol" NOT NULL,
    "displayName" TEXT NOT NULL,
    "emailDomain" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultRole" "TenantRole" NOT NULL DEFAULT 'VIEWER',
    "oidcIssuer" TEXT,
    "oidcClientId" TEXT,
    "oidcClientSecret" TEXT,
    "oidcScopes" TEXT NOT NULL DEFAULT 'openid email profile',
    "samlEntryPoint" TEXT,
    "samlIssuer" TEXT,
    "samlCert" TEXT,
    "samlAudience" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SsoConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScimToken" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ScimToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantUser_tenantId_externalId_key" ON "TenantUser"("tenantId", "externalId");
CREATE INDEX "SsoConnection_emailDomain_idx" ON "SsoConnection"("emailDomain");
CREATE UNIQUE INDEX "SsoConnection_tenantId_emailDomain_key" ON "SsoConnection"("tenantId", "emailDomain");
CREATE UNIQUE INDEX "ScimToken_tokenHash_key" ON "ScimToken"("tokenHash");
CREATE INDEX "ScimToken_tenantId_idx" ON "ScimToken"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_ssoConnectionId_fkey" FOREIGN KEY ("ssoConnectionId") REFERENCES "SsoConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SsoConnection" ADD CONSTRAINT "SsoConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScimToken" ADD CONSTRAINT "ScimToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
