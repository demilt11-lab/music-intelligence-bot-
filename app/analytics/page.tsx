"use client";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EngagementVelocity } from "@/components/analytics/EngagementVelocity";
import { GeoSpreadMap } from "@/components/analytics/GeoSpreadMap";
import { CreatorDiversityChart } from "@/components/analytics/CreatorDiversityChart";
import { GenreTrendChart } from "@/components/analytics/GenreTrendChart";
import { useAnalytics } from "@/hooks/useAnalytics";

export default function AnalyticsPage() {
  const { tracks, genreData, velocityData, isLoading } = useAnalytics();

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-zinc-400 text-sm mt-1">Music trend intelligence</p>
        </div>
        <Tabs defaultValue="velocity">
          <TabsList>
            <TabsTrigger value="velocity">Velocity</TabsTrigger>
            <TabsTrigger value="geographic">Geographic</TabsTrigger>
            <TabsTrigger value="creators">Creators</TabsTrigger>
            <TabsTrigger value="genres">Genres</TabsTrigger>
          </TabsList>
          <TabsContent value="velocity">
            <EngagementVelocity data={velocityData} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="geographic">
            <GeoSpreadMap isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="creators">
            <CreatorDiversityChart tracks={tracks} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="genres">
            <GenreTrendChart data={genreData} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
