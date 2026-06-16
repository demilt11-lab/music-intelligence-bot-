'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PRIMARY_NAV, isActiveNav } from './navItems'

/**
 * Persistent primary-section navigation rendered on every section page (via
 * PageShell). It gives users a consistent way to reach Home and any other major
 * section from anywhere, and highlights the active section so they always know
 * where they are (BUG-011).
 */
export function SectionNav() {
  const pathname = usePathname() ?? ''

  return (
    <nav aria-label="Primary" className="flex flex-wrap gap-2">
      {PRIMARY_NAV.map((item) => {
        const active = isActiveNav(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'rounded-full border px-3 py-1.5 text-xs font-medium transition',
              active
                ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'
                : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:bg-white/10 hover:text-zinc-100',
            ].join(' ')}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export default SectionNav
