export type NavItem = { label: string; href: string }

/**
 * Canonical list of primary product sections.
 *
 * Shared by the home-page sidebar and the section-page navigation (SectionNav)
 * so the two surfaces never drift apart. Update navigation here once.
 */
export const PRIMARY_NAV: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Talent Scout', href: '/talent-scout' },
  { label: 'Artists', href: '/artists' },
  { label: 'Songwriters', href: '/songwriters' },
  { label: 'Genres', href: '/genres' },
  { label: 'Playlists', href: '/playlists' },
  { label: 'Watchlist', href: '/watchlist' },
  { label: 'Analytics', href: '/analytics' },
]

/** True when `href` is the active section for the given pathname. */
export function isActiveNav(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}
