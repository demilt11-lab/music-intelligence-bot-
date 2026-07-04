'use client'

import React from 'react'
import { CompanionMessage } from '@/components/ui/CompanionMessage'
import { ScoreRing } from '@/components/ui/ScoreRing'
import { Badge } from '@/components/ui/Badge'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ToolResult {
  toolName: string
  ok: boolean
  data?: unknown
  error?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolResults?: ToolResult[]
}

interface ArtistScoreResult {
  artist_id: number
  name: string
  country?: string | null
  heat_score?: number | null
  breakout_prob_30d?: number | null
  listeners_growth_30d?: number | null
}

interface FeatureBreakdown {
  feature: string
  value: number | null
  contribution: string
  description: string
}

interface ArtistExplanation {
  artist_id: number
  name: string
  breakout_prob_30d?: number | null
  heat_score?: number | null
  feature_breakdown: FeatureBreakdown[]
  summary: string
}

const SUGGESTIONS = [
  'Who are the hottest breakout artists in pop right now?',
  'Explain why artist 42 is scoring high',
  'Find undiscovered hip-hop artists under 50k monthly listeners',
]

// ─── Tool result rendering ───────────────────────────────────────────────────

function ArtistRow({ artist }: { artist: ArtistScoreResult }) {
  const heat = typeof artist.heat_score === 'number' ? artist.heat_score / 10 : 0
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <ScoreRing score={heat} size={36} strokeWidth={3} label={`Heat score ${artist.heat_score ?? '—'}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-100">{artist.name}</p>
        <p className="text-xs text-zinc-500">
          {artist.country ?? 'Unknown market'}
          {typeof artist.listeners_growth_30d === 'number'
            ? ` · listeners ${artist.listeners_growth_30d >= 0 ? '+' : ''}${artist.listeners_growth_30d.toFixed(1)}% (30d)`
            : ''}
        </p>
      </div>
      {typeof artist.breakout_prob_30d === 'number' ? (
        <Badge variant={artist.breakout_prob_30d >= 0.6 ? 'trending' : 'default'} size="sm">
          {(artist.breakout_prob_30d * 100).toFixed(0)}% breakout
        </Badge>
      ) : null}
    </div>
  )
}

function SearchArtistsCard({ data }: { data: unknown }) {
  const artists = Array.isArray(data) ? (data as ArtistScoreResult[]) : []
  if (artists.length === 0) {
    return (
      <CompanionMessage type="info" compact message="No artists matched those filters." />
    )
  }
  return (
    <div className="space-y-2">
      {artists.slice(0, 10).map((a) => (
        <ArtistRow key={a.artist_id} artist={a} />
      ))}
    </div>
  )
}

function ExplainArtistCard({ data }: { data: unknown }) {
  const explanation = data as ArtistExplanation
  if (!explanation?.name) return null
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-3">
        <ScoreRing
          score={typeof explanation.heat_score === 'number' ? explanation.heat_score / 10 : 0}
          size={44}
        />
        <div>
          <p className="text-sm font-semibold text-zinc-100">{explanation.name}</p>
          {typeof explanation.breakout_prob_30d === 'number' ? (
            <p className="text-xs text-zinc-500">
              {(explanation.breakout_prob_30d * 100).toFixed(0)}% breakout probability
            </p>
          ) : null}
        </div>
      </div>

      {explanation.feature_breakdown?.length ? (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {explanation.feature_breakdown
            .filter((f) => f.value !== null)
            .map((f) => (
              <div
                key={f.feature}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs"
              >
                <span className="text-zinc-400">{f.contribution}</span>
                <span className="font-medium tabular-nums text-zinc-200">
                  {f.value !== null ? f.value.toFixed(1) : '—'}
                </span>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  )
}

function ToolResultCard({ result }: { result: ToolResult }) {
  if (!result.ok) {
    return (
      <CompanionMessage
        type="warning"
        compact
        message={`${result.toolName}: ${result.error ?? 'request failed'}`}
      />
    )
  }
  if (result.toolName === 'search_artists') return <SearchArtistsCard data={result.data} />
  if (result.toolName === 'explain_artist') return <ExplainArtistCard data={result.data} />
  return null
}

// ─── Chat bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={[
            'rounded-[18px] px-4 py-2.5 text-sm leading-6',
            isUser
              ? 'border border-emerald-400/20 bg-emerald-500/10 text-emerald-50'
              : 'border border-white/10 bg-white/5 text-zinc-200',
          ].join(' ')}
        >
          {message.content}
        </div>
        {message.toolResults?.map((r, i) => (
          <ToolResultCard key={`${r.toolName}-${i}`} result={r} />
        ))}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ArBotChat() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [status, setStatus] = React.useState<{ ai: boolean; arApi: boolean } | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (body?.integrations) {
          setStatus({ ai: Boolean(body.integrations.ai), arApi: Boolean(body.integrations.arApi) })
        }
      })
      .catch(() => {})
  }, [])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isLoading])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const history = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }])
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/ar-bot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
      })
      const body = await res.json().catch(() => null)

      if (!res.ok || !body?.obj) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: body?.error ?? "Buddy couldn't respond — please try again." },
        ])
        return
      }

      const { reply, toolResults, error } = body.obj as {
        reply: string | null
        toolResults: ToolResult[]
        error?: string
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: reply ?? error ?? "Buddy couldn't find an answer to that.",
          toolResults,
        },
      ])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong reaching Buddy. Please try again.' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {status && (!status.ai || !status.arApi) ? (
        <CompanionMessage
          type="warning"
          message={
            !status.ai
              ? 'ANTHROPIC_API_KEY is not configured — Buddy can\'t generate replies yet.'
              : 'AR_API_URL is not configured — Buddy can\'t reach the A&R scoring service yet.'
          }
        />
      ) : null}

      <div
        ref={scrollRef}
        className="flex max-h-[60vh] min-h-[320px] flex-col gap-4 overflow-y-auto rounded-[22px] border border-white/10 bg-black/20 p-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-10 text-center">
            <p className="text-sm text-zinc-400">
              Ask Buddy about breakout artists, scoring explanations, or playlist fits.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-emerald-400/20 hover:bg-emerald-500/10 hover:text-emerald-200"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <MessageBubble key={i} message={m} />)
        )}

        {isLoading ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-[18px] border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 [animation-delay:300ms]" />
            </div>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(input)
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Buddy about artists, scores, or breakout candidates…"
          className="flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-400/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  )
}

export default ArBotChat
