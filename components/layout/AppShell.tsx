'use client';

import React, {
  useState,
  useEffect,
  useRef,
  createContext,
  useContext,
  useCallback,
  ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single navigation item. */
export interface NavItem {
  /** Route href. */
  href: string;
  /** Display label. */
  label: string;
  /** Icon element (16×16 suggested). */
  icon?: ReactNode;
  /** Optional badge count. */
  badge?: number;
  /** Whether this item is disabled. */
  disabled?: boolean;
}

/** A grouped section of nav items. */
export interface NavSection {
  /** Section heading (optional). */
  title?: string;
  items: NavItem[];
}

/** Props for the AppShell component. */
export interface AppShellProps {
  /** Nav sections rendered in the sidebar. */
  navSections?: NavSection[];
  /** Breadcrumb nodes rendered in the top bar. */
  breadcrumbs?: ReactNode;
  /** Notification area rendered in the top bar (right side). */
  notifications?: ReactNode;
  /** Whether to show the API key indicator. */
  showApiKeyIndicator?: boolean;
  /** Whether an API key is active. */
  apiKeyActive?: boolean;
  /** Page content. */
  children: ReactNode;
  /** Logo override. Defaults to built-in. */
  logo?: ReactNode;
  /** App name displayed in the sidebar. */
  appName?: string;
}

// ─── Sidebar context ──────────────────────────────────────────────────────────

interface SidebarCtx {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarCtx>({
  collapsed: false,
  setCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
});

// ─── Icons ────────────────────────────────────────────────────────────────────

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#10b981" />
      <path d="M7 17V8l3 4 3-6 3 6 2-3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

// ─── Nav item ─────────────────────────────────────────────────────────────────

function SideNavItem({
  item,
  collapsed,
  onClick,
}: {
  item: NavItem;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

  return (
    <Link
      href={item.disabled ? '#' : item.href}
      onClick={item.disabled ? (e) => e.preventDefault() : onClick}
      aria-current={isActive ? 'page' : undefined}
      aria-disabled={item.disabled}
      tabIndex={item.disabled ? -1 : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium',
        'transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        isActive
          ? 'bg-emerald-950 text-emerald-400 border border-emerald-900'
          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800',
        item.disabled && 'opacity-40 cursor-not-allowed',
        collapsed && 'justify-center px-2',
      )}
    >
      {item.icon && (
        <span className="w-4 h-4 shrink-0" aria-hidden="true">
          {item.icon}
        </span>
      )}
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span className="ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 tabular-nums">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

// ─── Sidebar content ──────────────────────────────────────────────────────────

function SidebarContent({
  navSections,
  collapsed,
  appName,
  logo,
  onItemClick,
}: {
  navSections: NavSection[];
  collapsed: boolean;
  appName: string;
  logo?: ReactNode;
  onItemClick?: () => void;
}) {
  const { setCollapsed } = useContext(SidebarContext);

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        className={cn(
          'flex items-center gap-2.5 px-3 py-4 border-b border-slate-800',
          collapsed && 'justify-center px-2',
        )}
      >
        {logo ?? <LogoMark />}
        {!collapsed && (
          <span className="text-sm font-semibold text-slate-100 truncate">{appName}</span>
        )}
      </div>

      {/* Nav sections */}
      <nav
        className="flex-1 overflow-y-auto px-2 py-3 space-y-4"
        aria-label="Primary navigation"
      >
        {navSections.map((section, si) => (
          <div key={si}>
            {section.title && !collapsed && (
              <p className="px-2.5 mb-1 text-2xs font-semibold text-slate-600 uppercase tracking-widest">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5 list-none p-0 m-0">
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

      {/* Collapse toggle (desktop only) */}
      <div className="hidden md:flex border-t border-slate-800 p-2">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex items-center justify-center w-full py-1.5 rounded-lg gap-2',
            'text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800',
            'transition-colors duration-150',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500',
          )}
        >
          <ChevronLeft
            className={cn('transition-transform duration-300', collapsed && 'rotate-180')}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </div>
  );
}

// ─── Top nav ──────────────────────────────────────────────────────────────────

function TopNav({
  breadcrumbs,
  notifications,
  showApiKeyIndicator,
  apiKeyActive,
}: {
  breadcrumbs?: ReactNode;
  notifications?: ReactNode;
  showApiKeyIndicator?: boolean;
  apiKeyActive?: boolean;
}) {
  const { mobileOpen, setMobileOpen } = useContext(SidebarContext);

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-[1100]',
        'h-14 flex items-center gap-3 px-4',
        'bg-slate-950/90 backdrop-blur-md',
        'border-b border-slate-800',
        // Width adjusts based on sidebar state handled via CSS var
        'left-0 md:left-[var(--sidebar-w,224px)]',
        'transition-[left] duration-300',
      )}
    >
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileOpen}
        aria-controls="mobile-drawer"
        className={cn(
          'md:hidden flex items-center justify-center w-8 h-8 rounded-lg',
          'text-slate-400 hover:text-slate-100 hover:bg-slate-800',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        )}
      >
        {mobileOpen ? <CloseIcon /> : <MenuIcon />}
      </button>

      {/* Breadcrumbs */}
      <div className="flex-1 min-w-0 flex items-center">
        {breadcrumbs ?? <span className="text-slate-600 text-sm">—</span>}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {showApiKeyIndicator && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium',
              apiKeyActive
                ? 'text-emerald-400 bg-emerald-950 border border-emerald-900'
                : 'text-slate-500 bg-slate-900 border border-slate-800',
            )}
            title={apiKeyActive ? 'API key active' : 'No API key'}
            aria-label={apiKeyActive ? 'API key active' : 'No API key configured'}
          >
            <KeyIcon />
            {apiKeyActive ? 'API' : 'No key'}
          </div>
        )}
        {notifications}
      </div>
    </header>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

const DEFAULT_NAV_SECTIONS: NavSection[] = [
  {
    items: [
      {
        href: '/',
        label: 'Home',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      {
        href: '/tracks',
        label: 'Tracks',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
          </svg>
        ),
      },
      {
        href: '/artists',
        label: 'Artists',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
      {
        href: '/talent-scout',
        label: 'Talent Scout',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ),
      },
      {
        href: '/search',
        label: 'Search',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Catalog',
    items: [
      {
        href: '/playlists',
        label: 'Playlists',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        ),
      },
      {
        href: '/curators',
        label: 'Curators',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        ),
      },
      {
        href: '/genres',
        label: 'Genres',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        ),
      },
      {
        href: '/songwriters',
        label: 'Songwriters',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        ),
      },
    ],
  },
];

/**
 * Production app shell with fixed top nav, collapsible sidebar,
 * mobile hamburger drawer, breadcrumbs, and notifications slots.
 * Fully responsive (mobile → desktop).
 */
export function AppShell({
  navSections = DEFAULT_NAV_SECTIONS,
  breadcrumbs,
  notifications,
  showApiKeyIndicator = false,
  apiKeyActive = false,
  children,
  logo,
  appName = 'Music Intelligence',
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const sidebarWidth = collapsed ? 56 : 224;

  // Close mobile drawer on route change
  const pathname = usePathname();
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile drawer on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileOpen) setMobileOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mobileOpen]);

  // Focus trap for mobile drawer
  useEffect(() => {
    if (mobileOpen) {
      drawerRef.current?.focus();
    }
  }, [mobileOpen]);

  const handleMobileItemClick = useCallback(() => {
    setMobileOpen(false);
  }, []);

  return (
    <SidebarContext.Provider
      value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}
    >
      {/* Skip to content */}
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        aria-label="Sidebar navigation"
        className={cn(
          'hidden md:flex flex-col fixed top-0 left-0 bottom-0 z-[1100]',
          'bg-slate-950 border-r border-slate-800',
          'transition-[width] duration-300 overflow-hidden',
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

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[1200] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          id="mobile-drawer"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <div
            ref={drawerRef}
            tabIndex={-1}
            className={cn(
              'absolute top-0 left-0 bottom-0 w-64',
              'bg-slate-950 border-r border-slate-800',
              'animate-slide-in-left',
              'focus:outline-none',
            )}
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
      )}

      {/* Top nav */}
      <div
        style={
          {
            '--sidebar-w': `${sidebarWidth}px`,
          } as React.CSSProperties
        }
      >
        <TopNav
          breadcrumbs={breadcrumbs}
          notifications={notifications}
          showApiKeyIndicator={showApiKeyIndicator}
          apiKeyActive={apiKeyActive}
        />
      </div>

      {/* Main content */}
      <div
        className={cn(
          'transition-[padding-left] duration-300',
          'pt-14', // top nav height
          'md:pl-[var(--sidebar-w,224px)]',
        )}
        style={
          {
            '--sidebar-w': `${sidebarWidth}px`,
          } as React.CSSProperties
        }
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
  );
}

AppShell.displayName = 'AppShell';

export default AppShell;
