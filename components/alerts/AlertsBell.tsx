"use client";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArtistAlerts, useMarkArtistAlertsRead } from "@/hooks/useArtistAlerts";

const SEV_DOT: Record<string, string> = {
  high: "bg-rose-400",
  medium: "bg-amber-400",
  low: "bg-zinc-400",
};

export function AlertsBell() {
  const { data } = useArtistAlerts(true);
  const markRead = useMarkArtistAlertsRead();

  const unreadCount = data?.unreadCount ?? 0;
  const topAlerts = data?.alerts.slice(0, 5) ?? [];

  return (
    <div className="relative group">
      <Button variant="ghost" size="icon" className="relative" aria-label="Alerts">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Dropdown on hover/focus */}
      <div className="hidden group-hover:block absolute right-0 top-full mt-1 z-50 w-80 rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
          <span className="text-xs font-semibold text-zinc-300">Alerts</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markRead.mutate({ all: true })}
              className="text-[10px] text-violet-400 hover:text-violet-300"
            >
              Mark all read
            </button>
          )}
        </div>
        {topAlerts.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-zinc-500">No new alerts</div>
        ) : (
          <div className="divide-y divide-zinc-800/50 max-h-72 overflow-y-auto">
            {topAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`px-3 py-2.5 ${alert.read ? "opacity-50" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${SEV_DOT[alert.severity]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-200 truncate">{alert.artist.name}</p>
                    <p className="text-[10px] text-zinc-400 leading-relaxed mt-0.5 line-clamp-2">{alert.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
