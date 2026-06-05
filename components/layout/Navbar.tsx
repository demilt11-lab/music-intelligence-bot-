"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Zap, LogOut, User, Settings } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { AlertsBell } from "@/components/alerts/AlertsBell";
import { useState } from "react";

export function Navbar() {
  const { user, signOut } = useUser();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl flex items-center px-4 gap-4">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-bold text-sm text-white hidden sm:block">Music Intel</span>
      </Link>

      {/* Search trigger */}
      <button
        onClick={() => router.push("/search")}
        className="flex-1 max-w-sm h-8 flex items-center gap-2 px-3 bg-zinc-800/60 border border-zinc-700/50 rounded-lg text-zinc-500 text-sm hover:bg-zinc-800 transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:block">Search songs, artists…</span>
        <kbd className="ml-auto hidden sm:block text-xs bg-zinc-700 px-1.5 py-0.5 rounded text-zinc-400">⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {/* Notifications */}
        <AlertsBell />

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold hover:bg-violet-500 transition-colors"
          >
            {user?.email?.[0]?.toUpperCase() ?? "U"}
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl py-1 z-50">
              <div className="px-3 py-2 border-b border-zinc-800">
                <p className="text-xs text-zinc-400 truncate">{user?.email}</p>
              </div>
              <Link href="/watchlist" className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors" onClick={() => setMenuOpen(false)}>
                <User className="w-3.5 h-3.5" /> Watchlist
              </Link>
              <Link href="/alerts" className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors" onClick={() => setMenuOpen(false)}>
                <Settings className="w-3.5 h-3.5" /> Alerts
              </Link>
              <button onClick={() => { signOut(); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-400 hover:bg-zinc-800 transition-colors">
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
