"use client";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { WatchlistGrid } from "@/components/watchlist/WatchlistGrid";
import { useWatchlist, useRemoveFromWatchlist } from "@/hooks/useWatchlist";
import { Button } from "@/components/ui/button";

type SortKey = "added" | "name";

export default function WatchlistPage() {
  const { data: items = [], isLoading } = useWatchlist();
  const removeMutation = useRemoveFromWatchlist();
  const [sort, setSort] = useState<SortKey>("added");

  const sorted = [...items].sort((a, b) => {
    if (sort === "name") return a.trackName.localeCompare(b.trackName);
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Watchlist</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {items.length} song{items.length !== 1 ? "s" : ""} tracked
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={sort === "added" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSort("added")}
            >
              Recently Added
            </Button>
            <Button
              variant={sort === "name" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSort("name")}
            >
              Name
            </Button>
          </div>
        </div>
        <WatchlistGrid
          items={sorted}
          isLoading={isLoading}
          onRemove={(id) => removeMutation.mutate(id)}
        />
      </div>
    </AppShell>
  );
}
