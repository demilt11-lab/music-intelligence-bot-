/**
 * Central barrel export for all UI components.
 * Import from "@/components" for clean, discoverable imports.
 */

// ─── UI primitives ────────────────────────────────────────────────────────────

export { Button } from './ui/Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './ui/Button';

export { Badge } from './ui/Badge';
export type { BadgeProps, BadgeVariant, BadgeSize } from './ui/Badge';

export { Card } from './ui/Card';
export type { CardProps, CardVariant, CardPadding, CardSectionProps, CardStatProps } from './ui/Card';

export { Tabs } from './ui/Tabs';
export type { TabsProps, TabsVariant, TabItem } from './ui/Tabs';

export { Modal } from './ui/Modal';
export type { ModalProps, ModalSize, ModalSectionProps } from './ui/Modal';

export { Pagination } from './ui/Pagination';
export type { PaginationProps } from './ui/Pagination';

export { SearchInput } from './ui/SearchInput';
export type { SearchInputProps } from './ui/SearchInput';

export { Tooltip } from './ui/Tooltip';
export type { TooltipProps, TooltipPosition } from './ui/Tooltip';

export {
  Skeleton,
  SkeletonBox,
  SkeletonText,
  SkeletonCard,
  SkeletonAvatar,
  SkeletonStat,
  SkeletonTableRow,
  SkeletonChart,
} from './ui/Skeleton';
export type { SkeletonProps, SkeletonVariant } from './ui/Skeleton';

// ─── Existing UI components (preserve existing) ───────────────────────────────

export { DataTable } from './ui/DataTable';
export { PageShell } from './ui/PageShell';
export { Select } from './ui/Select';

// ─── Music components ─────────────────────────────────────────────────────────

export { TrendBadge } from './music/TrendBadge';
export type { TrendBadgeProps, TrendLabel } from './music/TrendBadge';

export { ViralScoreGauge } from './music/ViralScoreGauge';
export type { ViralScoreGaugeProps } from './music/ViralScoreGauge';

export { TrackCard } from './music/TrackCard';
export type { TrackCardProps, TrackCardData } from './music/TrackCard';

export { ArtistCard } from './music/ArtistCard';
export type { ArtistCardProps, ArtistCardData, ArtistStatus } from './music/ArtistCard';

export { PlatformStats } from './music/PlatformStats';
export type { PlatformStatsProps, PlatformStatsData, PlatformMetric } from './music/PlatformStats';

export { SparkLine } from './music/SparkLine';
export type { SparkLineProps } from './music/SparkLine';

// ─── Existing music/genre/talent-scout components ─────────────────────────────

export { GenreBreakoutTable } from './genres/GenreBreakoutTable';
export { DailyTalentScout } from './talent-scout/DailyTalentScout';

// ─── Layout ───────────────────────────────────────────────────────────────────

export { AppShell } from './layout/AppShell';
export type { AppShellProps, NavItem, NavSection } from './layout/AppShell';
