"use client";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const STATIC_DATA = [
  { region: "United States", pct: 38 },
  { region: "United Kingdom", pct: 18 },
  { region: "Brazil", pct: 12 },
  { region: "Germany", pct: 8 },
  { region: "Japan", pct: 7 },
  { region: "Other", pct: 17 },
];

const COLORS = ["#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#3b0764", "#3f3f46"];

interface Props {
  isLoading?: boolean;
}

export function GeoSpreadMap({ isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Geographic Spread</CardTitle>
        <CardDescription>Streaming activity by region (sample data)</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={STATIC_DATA} layout="vertical" margin={{ top: 0, right: 24, left: 80, bottom: 0 }}>
            <XAxis type="number" tick={{ fill: "#71717a", fontSize: 11 }} unit="%" />
            <YAxis type="category" dataKey="region" tick={{ fill: "#a1a1aa", fontSize: 12 }} width={80} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
              formatter={(v: number) => [`${v}%`, "Share"]}
            />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
              {STATIC_DATA.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
