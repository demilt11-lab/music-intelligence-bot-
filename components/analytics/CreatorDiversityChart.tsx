"use client";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrendingEntry } from "@/types";

interface Props {
  tracks: TrendingEntry[];
  isLoading?: boolean;
}

export function CreatorDiversityChart({ tracks, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const established = tracks.filter((t) => (t.viralityScore ?? 0) > 60).length;
  const emerging = tracks.length - established;

  const data = [
    { name: "Established Artists", value: established },
    { name: "Emerging Artists", value: emerging },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Creator Diversity</CardTitle>
        <CardDescription>Viral track distribution by artist type</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie data={data} cx="50%" cy="45%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={4}>
              <Cell fill="#7c3aed" />
              <Cell fill="#10b981" />
            </Pie>
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
            />
            <Legend wrapperStyle={{ color: "#a1a1aa", fontSize: 13 }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
