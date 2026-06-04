"use client";
import { BookmarkX } from "lucide-react";
import { WatchlistItem } from "./WatchlistItem";
import { Skeleton } from "@/components/ui/skeleton";
import type { WatchlistItem as WatchlistItemType } from "@/types";

interface Props {
  items: WatchlistItemType[];
  isLoading?: boolean;
  onRemove: (id: string) => void;
}

export function WatchlistGrid({ items, isLoading, onRemove }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BookmarkX className="h-12 w-12 text-zinc-600 mb-4" />
        <p className="text-zinc-400 text-sm">Your watchlist is empty.</p>
        <p className="text-zinc-500 text-xs mt-1">Add songs from the leaderboard or search results.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {items.map((item) => (
        <WatchlistItem key={item.id} item={item} onRemove={onRemove} />
      ))}
    </div>
  );
}
