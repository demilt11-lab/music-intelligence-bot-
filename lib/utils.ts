import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatScore(value: number, decimals = 1): string {
  return (value * 100).toFixed(decimals);
}

export function formatDays(days: number): string {
  if (days <= 7) return `${Math.round(days)}d`;
  if (days <= 30) return `${Math.round(days / 7)}w`;
  if (days <= 365) return `${Math.round(days / 30)}mo`;
  return ">1yr";
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function scoreColor(score: number): string {
  if (score >= 0.8) return "text-emerald-400";
  if (score >= 0.6) return "text-violet-400";
  if (score >= 0.4) return "text-amber-400";
  return "text-zinc-400";
}

export function scoreBg(score: number): string {
  if (score >= 0.8) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (score >= 0.6) return "bg-violet-500/20 text-violet-400 border-violet-500/30";
  if (score >= 0.4) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-zinc-700/40 text-zinc-400 border-zinc-600/30";
}

export function deltaIcon(delta: number): string {
  if (delta > 0) return "↑";
  if (delta < 0) return "↓";
  return "—";
}

export function deltaColor(delta: number): string {
  if (delta > 0) return "text-emerald-400";
  if (delta < 0) return "text-rose-400";
  return "text-zinc-500";
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function keyName(key: number): string {
  const keys = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return keys[key % 12] ?? "?";
}

export function modeName(mode: number): string {
  return mode === 1 ? "Major" : "Minor";
}
