"use client";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface GenreEntry { genre: string; count: number; pct: number }

interface Props {
  data: GenreEntry[];
  isLoading?: boolean;
}

export function GenreTrendChart({ data, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Genre Trends</CardTitle>
        <CardDescription>Distribution of trending tracks by genre</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 60, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#71717a", fontSize: 11 }} />
            <YAxis type="category" dataKey="genre" tick={{ fill: "#a1a1aa", fontSize: 12 }} width={60} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
              formatter={(v: number, _: string, p: { payload: GenreEntry }) =>
                [`${v} tracks (${p.payload.pct}%)`, "Count"]
              }
            />
            <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
