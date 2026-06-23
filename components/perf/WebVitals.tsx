'use client'

import { useReportWebVitals } from 'next/web-vitals'

/**
 * Reports Core Web Vitals (LCP, INP, CLS, FCP, TTFB) to an internal endpoint
 * so startup/render performance is measurable in every environment — this is
 * the instrumentation the QA "app is laggy" finding needs to be observable and
 * regression-tested over time. Failures are swallowed; telemetry must never
 * affect the page.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    try {
      const body = JSON.stringify({
        name: metric.name,
        value: metric.value,
        rating: (metric as { rating?: string }).rating ?? null,
        id: metric.id,
        path: window.location.pathname,
      })

      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/internal/web-vitals', body)
      } else {
        void fetch('/api/internal/web-vitals', {
          method: 'POST',
          body,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        })
      }
    } catch {
      /* telemetry is best-effort */
    }
  })

  return null
}

export default WebVitals
