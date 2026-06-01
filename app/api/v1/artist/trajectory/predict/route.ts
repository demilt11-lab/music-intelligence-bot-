// app/api/v1/artist/trajectory/predict/route.ts
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const ML_URL =
  process.env.ML_ARTIST_TRAJECTORY_URL ||
  "http://localhost:8000/v1/artist/trajectory/predict";

type MlRequestItem = {
  artist_id: number;
  streams7dDelta: number;
  streams28dDelta: number;
  streams90dDelta: number;
  playlistsDelta28d: number;
  followersDelta28d: number;
  tiktokVelocityScore: number;
  airplayVelocityScore: number;
  maxTrackProbViral: number;
  spotifyBreakProb: number;
};

type MlResponseItem = {
  artist_id: number;
  status: string;
  breakProbability: number;
  modelName: string;
  modelVersion: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const artistIds: number[] = body.artistIds;
    if (!artistIds || !artistIds.length) {
      return NextResponse.json(
        { error: "artistIds required" },
        { status: 400 },
      );
    }

    // Fetch latest trajectory snapshot features for these artists
    const snapshots =
      await db.artistTrajectorySnapshot.findMany({
        where: {
          artistId: { in: artistIds },
        },
        orderBy: {
          date: "desc",
        },
        distinct: ["artistId"],
      });

    if (!snapshots.length) {
      return NextResponse.json(
        { obj: [] },
        { status: 200 },
      );
    }

    // For each artist, compute maxTrackProbViral (quick call into DB)
    const items: MlRequestItem[] = [];
    for (const s of snapshots) {
      const artistId = Number(s.artistId);
      const tracks = await db.track.findMany({
        where: {
          trackArtists: {
            some: { artistId },
          },
        },
        orderBy: { releaseDate: "desc" },
        take: 10,
      });
      const trackIds = tracks.map((t) => t.id);
      let maxTrackProbViral = 0;
      if (trackIds.length) {
        const preds =
          await db.trackTrendPrediction.findMany({
            where: {
              trackId: { in: trackIds },
            },
          });
        for (const p of preds) {
          if (p.probViral > maxTrackProbViral) {
            maxTrackProbViral = p.probViral;
          }
        }
      }

      items.push({
        artist_id: artistId,
        streams7dDelta: s.streams7dDelta,
        streams28dDelta: s.streams28dDelta,
        streams90dDelta: s.streams90dDelta,
        playlistsDelta28d: s.playlistsDelta28d ?? 0,
        followersDelta28d: s.followersDelta28d ?? 0,
        tiktokVelocityScore: s.tiktokVelocityScore ?? 0,
        airplayVelocityScore: s.airplayVelocityScore ?? 0,
        maxTrackProbViral,
        spotifyBreakProb: s.spotifyBreakProb ?? 0,
      });
    }

    const mlRes = await fetch(ML_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items }),
    });

    if (!mlRes.ok) {
      const text = await mlRes.text();
      return NextResponse.json(
        {
          error: "ML service error",
          details: text,
        },
        { status: 502 },
      );
    }

    const mlJson: { items: MlResponseItem[] } =
      await mlRes.json();

    // Optionally write back to DB
    for (const r of mlJson.items) {
      const snapshot =
        snapshots.find(
          (s) => Number(s.artistId) === r.artist_id,
        );
      if (!snapshot) continue;

      await db.artistTrajectorySnapshot.update({
        where: { id: snapshot.id },
        data: {
          status: r.status,
          statusScore: r.breakProbability,
          breakProbability: r.breakProbability,
        },
      });
    }

    return NextResponse.json({
      obj: mlJson.items.map((r) => ({
        artistId: r.artist_id.toString(),
        status: r.status,
        breakProbability: r.breakProbability,
        modelName: r.modelName,
        modelVersion: r.modelVersion,
      })),
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
