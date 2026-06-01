// app/artists/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type BreakingArtist = {
  artistId: string;
  name: string | null;
  code2: string | null;
  primaryGenre: string | null;
  primaryCode2: string | null;
  status: string;
  statusScore: number;
  breakProbability: number | null;
  streams28dDelta: number;
  playlistsDelta28d: number | null;
  followersDelta28d: number | null;
};

type BreakingResponse = {
  obj: BreakingArtist[];
  offset: number;
  total: number;
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

export default function ArtistsDashboardPage() {
  const [status, setStatus] = useState("ABOUT_TO_BREAK");
  const [genre, setGenre] = useState("");
  const [code2, setCode2] = useState("");
  const [data, setData] = useState<BreakingArtist[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (genre) params.set("genre", genre);
      if (code2) params.set("code2", code2);
      params.set("limit", "100");

      const res = await fetch(
        `/api/artists/breaking?${params.toString()}`,
      );
      if (!res.ok) {
        setData([]);
        setTotal(0);
        setLoading(false);
        return;
      }
      const json: BreakingResponse = await res.json();
      setData(json.obj);
      setTotal(json.total);
      setLoading(false);
    }

    load();
  }, [status, genre, code2]);

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          Artist trajectories
        </h1>
        <p className="text-sm text-slate-500">
          Scan artists that are about to break,
          growing, stable, or declining by genre and
          region.
        </p>
      </header>

      {/* Filters */}
      <section className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">
            Status
          </label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value)
            }
          >
            <option value="ABOUT_TO_BREAK">
              About to break
            </option>
            <option value="GROWING">
              Growing
            </option>
            <option value="STABLE">Stable</option>
            <option value="DECLINING">
              Declining
            </option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">
            Genre (optional)
          </label>
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="hip hop, pop, etc."
            value={genre}
            onChange={(e) =>
              setGenre(e.target.value)
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-500">
            Region code (optional)
          </label>
          <input
            className="border rounded px-2 py-1 text-sm"
            placeholder="US, GB, BR…"
            value={code2}
            onChange={(e) =>
              setCode2(e.target.value.toUpperCase())
            }
          />
        </div>

        <div className="text-xs text-slate-500 ml-auto">
          {loading
            ? "Loading…"
            : `${total} artists found`}
        </div>
      </section>

      {/* Table */}
      <section className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className="px-2 py-1 text-left">
                Artist
              </th>
              <th className="px-2 py-1 text-left">
                Status
              </th>
              <th className="px-2 py-1 text-left">
                Genre
              </th>
              <th className="px-2 py-1 text-left">
                Region
              </th>
              <th className="px-2 py-1 text-right">
                Break prob
              </th>
              <th className="px-2 py-1 text-right">
                Streams 28d Δ
              </th>
              <th className="px-2 py-1 text-right">
                Playlists 28d Δ
              </th>
              <th className="px-2 py-1 text-right">
                Followers 28d Δ
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={row.artistId}
                className="hover:bg-slate-50"
              >
                <td className="px-2 py-1">
                  {row.artistId ? (
                    <Link
                      href={`/artists/${row.artistId}`}
                      className="text-blue-600 hover:underline"
                    >
                      {row.name || row.artistId}
                    </Link>
                  ) : (
                    row.name || "Unknown"
                  )}
                </td>
                <td className="px-2 py-1">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor(
                      row.status,
                    )}`}
                  >
                    {row.status.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="px-2 py-1">
                  {row.primaryGenre || "—"}
                </td>
                <td className="px-2 py-1">
                  {row.primaryCode2 ||
                    row.code2 ||
                    "—"}
                </td>
                <td className="px-2 py-1 text-right">
                  {row.breakProbability != null
                    ? `${(
                        row.breakProbability *
                        100
                      ).toFixed(1)}%`
                    : "—"}
                </td>
                <td className="px-2 py-1 text-right">
                  {formatPct(row.streams28dDelta)}
                </td>
                <td className="px-2 py-1 text-right">
                  {formatPct(
                    row.playlistsDelta28d ?? 0,
                  )}
                </td>
                <td className="px-2 py-1 text-right">
                  {formatPct(
                    row.followersDelta28d ?? 0,
                  )}
                </td>
              </tr>
            ))}
            {!loading && data.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-2 py-4 text-center text-slate-500"
                >
                  No artists found for the current
                  filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
