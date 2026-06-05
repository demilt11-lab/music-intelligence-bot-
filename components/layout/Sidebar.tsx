"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Search, TrendingUp, Bell, Bookmark, BarChart2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/analytics", icon: BarChart2, label: "Analytics" },
  { href: "/watchlist", icon: Bookmark, label: "Watchlist" },
  { href: "/alerts", icon: Bell, label: "Alerts" },
  { href: "/monitor", icon: Activity, label: "Model Monitor" },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 py-4 px-3">
      <nav className="space-y-0.5">
        {links.map(({ href, icon: Icon, label }) => (
          <Link
            key={href} href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              path === href
                ? "bg-violet-600/20 text-violet-300"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
