// app/artists/[artistId]/page.tsx
"use client";

import { useEffect, useState } from "react";

type Artist = {
  id: string;
  name: string;
  code2: string | null;
};

type ArtistDailyStats = {
  artistId: bigint;
  date: string;
  totalStreams: string;
  playlistCount: number | null;
  editorialPlaylistCount: number | null;
  indiePlaylistCount: number | null;
  playlistReach: string | null;
  genres: string[];
  primaryCode2: string | null;
};

type ArtistTrajectorySnapshot = {
  id: bigint;
  artistId: bigint;
  date: string;
  streams7d: number;
  streams28d: number;
  streams90d: number;
  streams7dDelta: number;
  streams28dDelta: number;
  streams90dDelta: number;
  followersDelta28d: number | null;
  playlistsDelta28d: number | null;
  primaryGenre: string | null;
  primaryCode2: string | null;
  status: string;
  statusScore: number;
  breakProbability: number | null;
};

type Release = {
  id: string;
  name: string;
  isrc: string | null;
  albums: { id: bigint; name: string }[];
  statistics: {
    spotifyStreams: string | null;
  } | null;
};

type TrajectoryResponse = {
  obj: {
    artist: Artist;
    snapshot: ArtistTrajectorySnapshot | null;
    history: ArtistDailyStats[];
    releases: Release[];
  };
};

function statusColor(status: string) {
  switch (status) {
    case "ABOUT_TO_BREAK":
      return "bg-green-600 text-white";
    case "GROWING":
      return "bg-emerald-500 text-white";
    case "DECLINING":
      return "bg-red-500 text-white";
    default:
      return "bg-slate-500 text-white";
  }
}

function formatPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export default function ArtistPage({
  params,
}: {
  params: { artistId: string };
}) {
  const [data, setData] = useState<TrajectoryResponse["obj"] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch(
        `/api/artists/${params.artistId}/trajectory`,
      );
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const json: TrajectoryResponse = await res.json();
      setData(json.obj);
      setLoading(false);
    }
    load();
  }, [params.artistId]);

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading artist trajectory…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <p>Artist trajectory not available.</p>
      </div>
    );
  }

  const { artist, snapshot, history, releases } = data;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {artist.name}
        </h1>
        <p className="text-sm text-slate-500">
          Region: {artist.code2 || "Unknown"}
        </p>
        {snapshot && (
          <div className="flex flex-wrap gap-3 items-center">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusColor(
                snapshot.status,
              )}`}
            >
              {snapshot.status.replaceAll("_", " ")}
            </span>
            <span className="text-xs text-slate-500">
              Break probability:{" "}
              {snapshot.breakProbability != null
                ? `${(
                    snapshot.breakProbability * 100
                  ).toFixed(1)}%`
                : "—"}
            </span>
            <span className="text-xs text-slate-500">
              Primary genre:{" "}
              {snapshot.primaryGenre || "Unknown"}
            </span>
            <span className="text-xs text-slate-500">
              Primary region:{" "}
              {snapshot.primaryCode2 || "Unknown"}
            </span>
          </div>
        )}
      </header>

      {/* Streams timeline */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Streams over time
        </h2>
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="px-2 py-1 text-left">
                  Date
                </th>
                <th className="px-2 py-1 text-right">
                  Streams
                </th>
                <th className="px-2 py-1 text-right">
                  Playlists
                </th>
                <th className="px-2 py-1 text-right">
                  Playlist reach
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={`${h.artistId}-${h.date}`}>
                  <td className="px-2 py-1">
                    {h.date.slice(0, 10)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {Number(h.totalStreams).toLocaleString()}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {h.playlistCount ?? "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {h.playlistReach
                      ? Number(
                          h.playlistReach,
                        ).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Growth metrics */}
      {snapshot && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">
            Growth metrics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="border rounded-lg p-3">
              <p className="text-slate-500">
                Streams 28d Δ
              </p>
              <p className="text-base font-semibold">
                {formatPct(snapshot.streams28dDelta)}
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-slate-500">
                Streams 7d Δ
              </p>
              <p className="text-base font-semibold">
                {formatPct(snapshot.streams7dDelta)}
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-slate-500">
                Playlists 28d Δ
              </p>
              <p className="text-base font-semibold">
                {formatPct(
                  snapshot.playlistsDelta28d ?? 0,
                )}
              </p>
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-slate-500">
                Followers 28d Δ
              </p>
              <p className="text-base font-semibold">
                {formatPct(
                  snapshot.followersDelta28d ?? 0,
                )}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Releases */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Releases
        </h2>
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="px-2 py-1 text-left">
                  Track
                </th>
                <th className="px-2 py-1 text-left">
                  Album
                </th>
                <th className="px-2 py-1 text-left">
                  ISRC
                </th>
                <th className="px-2 py-1 text-right">
                  Spotify streams
                </th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1">
                    {r.name}
                  </td>
                  <td className="px-2 py-1">
                    {r.albums?.[0]?.name || "—"}
                  </td>
                  <td className="px-2 py-1">
                    {r.isrc || "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {r.statistics?.spotifyStreams
                      ? Number(
                          r.statistics.spotifyStreams,
                        ).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
