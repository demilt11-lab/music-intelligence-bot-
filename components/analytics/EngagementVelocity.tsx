"use client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  data: { date: string; velocity: number }[];
  isLoading?: boolean;
}

export function EngagementVelocity({ data, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const fmt = (d: string) => {
    const dt = new Date(d);
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engagement Velocity</CardTitle>
        <CardDescription>Average daily growth rate across top 100 tracks</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="velGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" tickFormatter={fmt} tick={{ fill: "#71717a", fontSize: 11 }} />
            <YAxis tick={{ fill: "#71717a", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
              labelFormatter={fmt}
            />
            <Area type="monotone" dataKey="velocity" stroke="#7c3aed" fill="url(#velGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
