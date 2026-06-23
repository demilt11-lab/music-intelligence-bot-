-- Per-user editable scouting workflows + directive for the home page.
-- Replaces the previously hardcoded "Scouting workflows" panel.

CREATE TABLE "scouting_workflows" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "href" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scouting_workflows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scouting_workflows_tenantId_userId_idx"
    ON "scouting_workflows"("tenantId", "userId");

CREATE TABLE "scout_directives" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scout_directives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scout_directives_tenantId_userId_key"
    ON "scout_directives"("tenantId", "userId");
