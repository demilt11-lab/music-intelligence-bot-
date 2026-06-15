-- CreateTable
CREATE TABLE "writer_producer_rising_scores" (
    "id" SERIAL NOT NULL,
    "songwriterId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "risingScore" DOUBLE PRECISION NOT NULL,
    "streamVelocity" DOUBLE PRECISION,
    "playlistMomentum" DOUBLE PRECISION,
    "collaborationScore" DOUBLE PRECISION,
    "ugcMomentum" DOUBLE PRECISION,
    "isSigned" BOOLEAN NOT NULL DEFAULT false,
    "signedLabel" TEXT,
    "region" TEXT DEFAULT 'GLOBAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writer_producer_rising_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "writer_producer_rising_scores_songwriterId_date_key"
    ON "writer_producer_rising_scores"("songwriterId", "date");

-- CreateIndex
CREATE INDEX "writer_producer_rising_scores_date_risingScore_idx"
    ON "writer_producer_rising_scores"("date", "risingScore" DESC);

-- AddForeignKey
ALTER TABLE "writer_producer_rising_scores"
    ADD CONSTRAINT "writer_producer_rising_scores_songwriterId_fkey"
    FOREIGN KEY ("songwriterId") REFERENCES "songwriters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
