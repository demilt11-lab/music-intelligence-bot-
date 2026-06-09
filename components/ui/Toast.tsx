'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type ToastType = 'success' | 'info' | 'warning' | 'error'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TYPE_CONFIG: Record<ToastType, { icon: string; bar: string; text: string }> = {
  success: {
    icon: '✓',
    bar: 'bg-emerald-500',
    text: 'text-emerald-400',
  },
  info: {
    icon: 'i',
    bar: 'bg-sky-500',
    text: 'text-sky-400',
  },
  warning: {
    icon: '!',
    bar: 'bg-amber-500',
    text: 'text-amber-400',
  },
  error: {
    icon: '✕',
    bar: 'bg-rose-500',
    text: 'text-rose-400',
  },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = 'info', duration = 4000) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

      setToasts((prev) => [...prev.slice(-4), { id, message, type, duration }])

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration)
        timers.current.set(id, timer)
      }

      return id
    },
    [dismiss]
  )

  useEffect(() => {
    const activeTimers = timers.current
    return () => {
      activeTimers.forEach(clearTimeout)
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)

  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>')
  }

  return ctx
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-[1400] flex flex-col gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} item={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem
  onDismiss: (id: string) => void
}) {
  const cfg = TYPE_CONFIG[item.type]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.94 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={cn(
        'pointer-events-auto relative flex w-full min-w-[260px] max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-slate-700/60 bg-slate-900 px-4 py-3 shadow-card-elevated'
      )}
      role="alert"
    >
      <div
        className={cn('absolute inset-y-0 left-0 w-1 rounded-l-xl', cfg.bar)}
        aria-hidden
      />

      <span className={cn('mt-0.5 shrink-0 text-sm font-bold', cfg.text)} aria-hidden>
        {cfg.icon}
      </span>

      <p className="flex-1 text-sm leading-snug text-slate-200">{item.message}</p>

      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="shrink-0 text-slate-500 transition-colors hover:text-slate-200"
      >
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1={18} y1={6} x2={6} y2={18} />
          <line x1={6} y1={6} x2={18} y2={18} />
        </svg>
      </button>
    </motion.div>
  )
}
