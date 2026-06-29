'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export interface NavItem {
  href: string
  label: string
  description?: string
  icon?: ReactNode
  badge?: number
  disabled?: boolean
  badge_label?: string
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

export interface AppShellProps {
  navSections?: NavSection[]
  breadcrumbs?: ReactNode
  notifications?: ReactNode
  showApiKeyIndicator?: boolean
  apiKeyActive?: boolean
  children: ReactNode
  logo?: ReactNode
  appName?: string
}

interface SidebarContextValue {
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (value: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

function useSidebarContext() {
  const ctx = useContext(SidebarContext)

  if (!ctx) {
    throw new Error('AppShell components must be used inside <AppShell>')
  }

  return ctx
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function LogoMark() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect width="24" height="24" rx="6" fill="#10b981" />
      <path
        d="M7 17V8l3 4 3-6 3 6 2-3"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function KeyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  )
}

function SideNavItem({
  item,
  collapsed,
  onClick,
}: {
  item: NavItem
  collapsed: boolean
  onClick?: () => void
}) {
  const pathname = usePathname()
  const isActive =
    pathname === item.href ||
    (item.href !== '/' && pathname.startsWith(item.href + '/'))

  return (
    <Link
      href={item.disabled ? '#' : item.href}
      onClick={item.disabled ? (e) => e.preventDefault() : onClick}
      aria-current={isActive ? 'page' : undefined}
      aria-disabled={item.disabled || undefined}
      tabIndex={item.disabled ? -1 : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-sm font-medium transition-all duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70',
        isActive
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
          : 'border-transparent text-slate-400 hover:border-white/5 hover:bg-slate-800/70 hover:text-slate-100',
        item.disabled && 'cursor-not-allowed opacity-40',
        collapsed && 'justify-center px-2'
      )}
    >
      {item.icon ? (
        <span className="h-4 w-4 shrink-0" aria-hidden="true">
          {item.icon}
        </span>
      ) : null}

      {!collapsed ? (
        <>
          <div className="flex-1 min-w-0">
            <span className="block truncate leading-tight">{item.label}</span>
            {item.description ? (
              <span className="block truncate text-[10px] text-slate-500 leading-tight mt-0.5">
                {item.description}
              </span>
            ) : null}
          </div>
          {item.badge !== undefined && item.badge > 0 ? (
            <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-slate-800 px-1.5 text-xs font-medium tabular-nums text-slate-300">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          ) : null}
          {item.badge_label ? (
            <span className="ml-auto inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-400">
              {item.badge_label}
            </span>
          ) : null}
        </>
      ) : null}
    </Link>
  )
}

function SidebarContent({
  navSections,
  collapsed,
  appName,
  logo,
  onItemClick,
}: {
  navSections: NavSection[]
  collapsed: boolean
  appName: string
  logo?: ReactNode
  onItemClick?: () => void
}) {
  const { setCollapsed } = useSidebarContext()

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex items-center gap-3 border-b border-white/10 px-3 py-4',
          collapsed && 'justify-center px-2'
        )}
      >
        {logo ?? <LogoMark />}
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{appName}</p>
            <p className="text-xs text-slate-500">Workspace</p>
          </div>
        ) : null}
      </div>

      <nav
        className="flex-1 space-y-4 overflow-y-auto px-2 py-3"
        aria-label="Primary navigation"
      >
        {navSections.map((section, index) => (
          <div key={`${section.title ?? 'section'}-${index}`}>
            {section.title && !collapsed ? (
              <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {section.title}
              </p>
            ) : null}

            <ul className="m-0 list-none space-y-1 p-0">
              {section.items.map((item) => (
                <li key={item.href}>
                  <SideNavItem
                    item={item}
                    collapsed={collapsed}
                    onClick={onItemClick}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="hidden border-t border-white/10 p-2 md:flex">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs text-slate-400 transition-colors duration-150',
            'hover:bg-slate-800/70 hover:text-slate-100',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70'
          )}
        >
          <ChevronLeft
            className={cn(
              'transition-transform duration-300',
              collapsed && 'rotate-180'
            )}
          />
          {!collapsed ? <span>Collapse</span> : null}
        </button>
      </div>
    </div>
  )
}

function TopNav({
  breadcrumbs,
  notifications,
  showApiKeyIndicator,
  apiKeyActive,
}: {
  breadcrumbs?: ReactNode
  notifications?: ReactNode
  showApiKeyIndicator?: boolean
  apiKeyActive?: boolean
}) {
  const { mobileOpen, setMobileOpen } = useSidebarContext()

  return (
    <header
      className={cn(
        'fixed right-0 top-0 z-[1100] flex h-14 items-center gap-3 border-b border-white/10',
        'bg-[#0a0d12]/90 px-4 backdrop-blur-md',
        'left-0 md:left-[var(--sidebar-w,224px)] transition-[left] duration-300'
      )}
    >
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileOpen}
        aria-controls="mobile-drawer"
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-colors duration-150 md:hidden',
          'hover:bg-slate-800/70 hover:text-white',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70'
        )}
      >
        {mobileOpen ? <CloseIcon /> : <MenuIcon />}
      </button>

      <div className="min-w-0 flex-1">
        {breadcrumbs ?? <span className="text-sm text-slate-500">Workspace</span>}
      </div>

      <div className="flex items-center gap-3">
        {showApiKeyIndicator ? (
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-xl border px-2 py-1 text-xs font-medium',
              apiKeyActive
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 bg-slate-900 text-slate-400'
            )}
            title={apiKeyActive ? 'API key active' : 'No API key'}
            aria-label={apiKeyActive ? 'API key active' : 'No API key configured'}
          >
            <KeyIcon />
            <span>{apiKeyActive ? 'API' : 'No key'}</span>
          </div>
        ) : null}

        {notifications}
      </div>
    </header>
  )
}

const DEFAULT_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      {
        href: '/',
        label: 'Home',
        description: 'Command center & quick tasks',
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-full w-full"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Scout',
    items: [
      {
        href: '/talent-scout',
        label: 'Talent Scout',
        description: 'AI breakout discovery feed',
        badge_label: 'Live',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ),
      },
      {
        href: '/search',
        label: 'Search',
        description: 'Artists, tracks, playlists & URLs',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        ),
      },
      {
        href: '/compare',
        label: 'Compare Artists',
        description: 'Side-by-side momentum analysis',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Catalog',
    items: [
      {
        href: '/artists',
        label: 'Artists',
        description: 'Momentum dashboard & status filters',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
      {
        href: '/playlists',
        label: 'Playlists',
        description: 'Editorial & algorithmic playlists',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        ),
      },
      {
        href: '/curators',
        label: 'Curators',
        description: 'Playlist curators by platform',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        ),
      },
      {
        href: '/genres',
        label: 'Genres',
        description: 'Momentum by genre & market',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        ),
      },
      {
        href: '/songwriters',
        label: 'Songwriters',
        description: 'Catalog credits & collaborations',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Workspace',
    items: [
      {
        href: '/watchlist',
        label: 'Watchlist',
        description: 'Your saved artists & tracks',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        ),
      },
      {
        href: '/analytics',
        label: 'Analytics',
        description: 'Workspace coverage & signal health',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        ),
      },
      {
        href: '/alerts',
        label: 'Alerts',
        description: 'Momentum & threshold notifications',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        ),
      },
    ],
  },
]

export function AppShell({
  navSections = DEFAULT_NAV_SECTIONS,
  breadcrumbs,
  notifications,
  showApiKeyIndicator = false,
  apiKeyActive = false,
  children,
  logo,
  appName = 'NOV8TE Buddy',
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  const sidebarWidth = collapsed ? 64 : 240

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && mobileOpen) {
        setMobileOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen])

  useEffect(() => {
    if (mobileOpen) {
      drawerRef.current?.focus()
    }
  }, [mobileOpen])

  const handleMobileItemClick = useCallback(() => {
    setMobileOpen(false)
  }, [])

  const contextValue = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      mobileOpen,
      setMobileOpen,
    }),
    [collapsed, mobileOpen]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <aside
        aria-label="Sidebar navigation"
        className={cn(
          'fixed bottom-0 left-0 top-0 z-[1100] hidden border-r border-white/10 bg-[#07090d] md:flex md:flex-col',
          'overflow-hidden transition-[width] duration-300'
        )}
        style={{ width: sidebarWidth }}
      >
        <SidebarContent
          navSections={navSections}
          collapsed={collapsed}
          appName={appName}
          logo={logo}
        />
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-[1200] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          id="mobile-drawer"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
          />
          <div
            ref={drawerRef}
            tabIndex={-1}
            className="absolute bottom-0 left-0 top-0 w-72 border-r border-white/10 bg-[#07090d] focus:outline-none"
          >
            <SidebarContent
              navSections={navSections}
              collapsed={false}
              appName={appName}
              logo={logo}
              onItemClick={handleMobileItemClick}
            />
          </div>
        </div>
      ) : null}

      <div
        style={{ '--sidebar-w': `${sidebarWidth}px` } as React.CSSProperties}
      >
        <TopNav
          breadcrumbs={breadcrumbs}
          notifications={notifications}
          showApiKeyIndicator={showApiKeyIndicator}
          apiKeyActive={apiKeyActive}
        />
      </div>

      <div
        className="pt-14 transition-[padding-left] duration-300 md:pl-[var(--sidebar-w,240px)]"
        style={{ '--sidebar-w': `${sidebarWidth}px` } as React.CSSProperties}
      >
        <main
          id="main-content"
          tabIndex={-1}
          className="min-h-[calc(100vh-3.5rem)] focus:outline-none"
        >
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  )
}

AppShell.displayName = 'AppShell'

export default AppShell
