"use client";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArtistWatchlist, useAddArtistToWatchlist, useRemoveArtistFromWatchlist, isArtistOnWatchlist } from "@/hooks/useArtistWatchlist";

interface Props {
  artistId: number;
  artistName?: string;
  size?: "sm" | "default";
}

export function WatchlistToggleButton({ artistId, artistName, size = "sm" }: Props) {
  const { data, isLoading: listLoading } = useArtistWatchlist();
  const add = useAddArtistToWatchlist();
  const remove = useRemoveArtistFromWatchlist();

  const watchlist = data?.watchlist ?? [];
  const watching = isArtistOnWatchlist(watchlist, artistId);
  const busy = add.isPending || remove.isPending || listLoading;

  const toggle = () => {
    if (watching) {
      remove.mutate(artistId);
    } else {
      add.mutate({ artistId, priority: "normal" });
    }
  };

  return (
    <Button
      variant={watching ? "default" : "outline"}
      size={size}
      onClick={toggle}
      disabled={busy}
      className={`gap-1.5 ${watching ? "bg-violet-600 hover:bg-violet-700 border-violet-600" : ""}`}
      title={watching ? `Remove ${artistName ?? "artist"} from watchlist` : `Add ${artistName ?? "artist"} to watchlist`}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : watching ? (
        <BookmarkCheck className="h-3.5 w-3.5" />
      ) : (
        <Bookmark className="h-3.5 w-3.5" />
      )}
      {watching ? "Watching" : "Watch"}
    </Button>
  );
}
