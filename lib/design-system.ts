/**
 * Design system tokens and constants for the NOV8TE music intelligence platform.
 * Single source of truth for colors, status configs, and platform configs.
 */

export const STATUS_CONFIG = {
  ABOUT_TO_BREAK: {
    label: 'Breaking',
    color: 'amber',
    icon: '🔥',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  GROWING: {
    label: 'Growing',
    color: 'emerald',
    icon: '↑',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  STABLE: {
    label: 'Stable',
    color: 'slate',
    icon: '→',
    badge: 'bg-slate-700/40 text-slate-400 border-slate-700/30',
  },
  DECLINING: {
    label: 'Declining',
    color: 'rose',
    icon: '↓',
    badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },
  VIRAL: {
    label: 'Viral',
    color: 'violet',
    icon: '⚡',
    badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  },
  NEW: {
    label: 'New',
    color: 'sky',
    icon: '★',
    badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  },
} as const;

export const PLATFORM_CONFIG = {
  spotify: {
    label: 'Spotify',
    color: '#1DB954',
    textClass: 'text-green-400',
    bgClass: 'bg-green-500/10',
    icon: '♪',
  },
  tiktok: {
    label: 'TikTok',
    color: '#FF0050',
    textClass: 'text-rose-400',
    bgClass: 'bg-rose-500/10',
    icon: '♬',
  },
  youtube: {
    label: 'YouTube',
    color: '#FF0000',
    textClass: 'text-red-400',
    bgClass: 'bg-red-500/10',
    icon: '▶',
  },
  instagram: {
    label: 'Instagram',
    color: '#E1306C',
    textClass: 'text-pink-400',
    bgClass: 'bg-pink-500/10',
    icon: '◈',
  },
  luminate: {
    label: 'Luminate',
    color: '#7c3aed',
    textClass: 'text-violet-400',
    bgClass: 'bg-violet-500/10',
    icon: '◉',
  },
  shazam: {
    label: 'Shazam',
    color: '#0ea5e9',
    textClass: 'text-sky-400',
    bgClass: 'bg-sky-500/10',
    icon: '⌖',
  },
} as const;

export type StatusKey = keyof typeof STATUS_CONFIG;
export type PlatformKey = keyof typeof PLATFORM_CONFIG;

/** Color classes by semantic role */
export const COLOR_CLASSES = {
  emerald: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-500',
  },
  amber: {
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    dot: 'bg-amber-500',
  },
  rose: {
    text: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    dot: 'bg-rose-500',
  },
  violet: {
    text: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    dot: 'bg-violet-500',
  },
  sky: {
    text: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/20',
    badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    dot: 'bg-sky-500',
  },
  slate: {
    text: 'text-slate-400',
    bg: 'bg-slate-700/40',
    border: 'border-slate-700/30',
    badge: 'bg-slate-700/40 text-slate-400 border-slate-700/30',
    dot: 'bg-slate-500',
  },
} as const;
