'use client'

import React from 'react'
import { PageShell } from '@/components/ui/PageShell'
import { CompanionMessage } from '@/components/ui/CompanionMessage'

type ApiKey = {
  id: number
  label: string
  scopes: string
  expiresAt: string | null
  isRevoked: boolean
  createdAt: string
  lastUsedAt: string | null
}

function fmtDate(iso: string | null) {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function KeyRow({
  apiKey,
  onRevoke,
}: {
  apiKey: ApiKey
  onRevoke: (id: number) => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-white">{apiKey.label}</p>
          {apiKey.isRevoked && (
            <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-300">
              Revoked
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Created {fmtDate(apiKey.createdAt)} &middot; Last used {fmtDate(apiKey.lastUsedAt)}
        </p>
        <p className="truncate text-[11px] text-zinc-600">{apiKey.scopes}</p>
      </div>

      {!apiKey.isRevoked && (
        <button
          onClick={() => onRevoke(apiKey.id)}
          className="shrink-0 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
        >
          Revoke
        </button>
      )}
    </div>
  )
}

export default function ApiKeysPage() {
  const [keys, setKeys] = React.useState<ApiKey[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [label, setLabel] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [newKey, setNewKey] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  const loadKeys = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ui/api-keys')
      if (!res.ok) throw new Error(`Failed to load keys (${res.status})`)
      const { obj } = await res.json()
      setKeys(obj)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load keys')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadKeys()
  }, [loadKeys])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    setNewKey(null)
    try {
      const res = await fetch('/api/ui/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || 'API key' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? `Create failed (${res.status})`)
      }
      const { obj } = await res.json()
      setNewKey(obj.apiKey)
      setLabel('')
      await loadKeys()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: number) {
    setError(null)
    try {
      const res = await fetch(`/api/ui/api-keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Revoke failed (${res.status})`)
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, isRevoked: true } : k)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to revoke key')
    }
  }

  async function handleCopy() {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const activeKeys = keys.filter((k) => !k.isRevoked)
  const revokedKeys = keys.filter((k) => k.isRevoked)

  return (
    <PageShell
      title="API Keys"
      description="Generate API keys to connect external tools and MCP clients to your music intelligence data."
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">

          {/* Create key form */}
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.84),rgba(10,10,11,0.96))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              New API key
            </p>

            <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <label htmlFor="key-label" className="text-xs font-medium text-zinc-400">
                  Label (optional)
                </label>
                <input
                  id="key-label"
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Claude MCP"
                  maxLength={64}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-emerald-400/40 focus:bg-white/[0.07]"
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Generate key'}
              </button>
            </form>

            {newKey && (
              <div className="mt-4 rounded-[18px] border border-emerald-400/20 bg-emerald-500/10 p-4">
                <p className="text-xs font-medium text-emerald-300">
                  Copy this key now — it will not be shown again.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-mono text-emerald-200">
                    {newKey}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {error && (
            <div className="rounded-[22px] border border-rose-500/20 bg-rose-500/10 p-4">
              <CompanionMessage type="warning" message={error} />
            </div>
          )}

          {/* Active keys */}
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.84),rgba(10,10,11,0.96))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Active keys
              </p>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                {activeKeys.length}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {loading && (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-[18px] border border-white/10 bg-white/[0.03] shimmer" />
                  ))}
                </div>
              )}

              {!loading && activeKeys.length === 0 && (
                <p className="py-6 text-center text-sm text-zinc-500">
                  No active keys. Generate one above.
                </p>
              )}

              {!loading && activeKeys.map((k) => (
                <KeyRow key={k.id} apiKey={k} onRevoke={handleRevoke} />
              ))}
            </div>
          </section>

          {/* Revoked keys */}
          {revokedKeys.length > 0 && (
            <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,24,39,0.84),rgba(10,10,11,0.96))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.28)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Revoked keys
              </p>
              <div className="mt-4 space-y-3">
                {revokedKeys.map((k) => (
                  <KeyRow key={k.id} apiKey={k} onRevoke={handleRevoke} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              MCP connection
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400">Endpoint</p>
                <p className="mt-1 break-all text-xs font-mono text-zinc-300">
                  /api/mcp
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400">Header</p>
                <p className="mt-1 text-xs font-mono text-zinc-300">x-api-key: &lt;your key&gt;</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-medium text-zinc-400">Default scopes</p>
                <p className="mt-1 break-all text-[11px] leading-5 text-zinc-400">
                  search:read · tracks:read · tracks:charts:read · tracks:radio:read · catalog:write · talent-scout:read · usage:read
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,23,0.95),rgba(10,10,11,0.98))] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
              Security
            </p>
            <div className="mt-4 space-y-3">
              {[
                'Keys are hashed before storage — the raw value is only shown once at creation.',
                'Revoke any key immediately if it is compromised.',
                'Each key is scoped to your tenant and cannot access other tenants.',
              ].map((tip) => (
                <div
                  key={tip}
                  className="rounded-2xl border border-white/10 bg-white/5 p-3"
                >
                  <p className="text-xs leading-5 text-zinc-400">{tip}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  )
}
