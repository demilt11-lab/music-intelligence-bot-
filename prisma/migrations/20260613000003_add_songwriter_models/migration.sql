-- CreateTable
CREATE TABLE "songwriters" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "ipi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "songwriters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "songwriter_tracks" (
    "songwriterId" INTEGER NOT NULL,
    "trackId" INTEGER NOT NULL,
    "role" TEXT,

    CONSTRAINT "songwriter_tracks_pkey" PRIMARY KEY ("songwriterId","trackId")
);

-- CreateIndex
CREATE UNIQUE INDEX "songwriters_slug_key" ON "songwriters"("slug");

-- AddForeignKey
ALTER TABLE "songwriter_tracks" ADD CONSTRAINT "songwriter_tracks_songwriterId_fkey" FOREIGN KEY ("songwriterId") REFERENCES "songwriters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songwriter_tracks" ADD CONSTRAINT "songwriter_tracks_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
