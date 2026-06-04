"use client";
import Link from "next/link";
import { X, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";
import type { WatchlistItem as WatchlistItemType } from "@/types";

interface Props {
  item: WatchlistItemType;
  onRemove: (id: string) => void;
}

export function WatchlistItem({ item, onRemove }: Props) {
  return (
    <Card className="hover:border-zinc-700 transition-colors">
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white truncate">{item.trackName}</p>
          <p className="text-xs text-zinc-400 mt-0.5 truncate">{item.artistName}</p>
          {item.notes && <p className="text-xs text-zinc-500 mt-1 truncate">{item.notes}</p>}
          <p className="text-xs text-zinc-600 mt-1">Added {timeAgo(item.addedAt)}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link href={`/songs/${item.trackId}`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="h-3 w-3" />
              View
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(item.id)}
            className="text-zinc-500 hover:text-rose-400"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
