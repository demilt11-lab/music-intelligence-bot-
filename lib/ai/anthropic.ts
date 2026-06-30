// lib/ai/anthropic.ts
//
// Minimal, dependency-free client for the Anthropic Messages API.
//
// We call the REST endpoint directly with `fetch` rather than pulling in
// `@anthropic-ai/sdk` so the AI layer adds zero install/build footprint to the
// Next.js app and degrades gracefully when no key is configured. The wire
// format (anthropic-version: 2023-06-01) is stable.
//
// Every function fails soft: if the key is missing, the request errors, the
// model refuses, or the call times out, we return null and the caller falls
// back to a deterministic heuristic. The product must never surface an
// AI-sounding output that isn't actually backed by a real model response.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// Per Anthropic's current model lineup; override with ANTHROPIC_MODEL if needed.
const DEFAULT_MODEL = 'claude-opus-4-8'
const DEFAULT_TIMEOUT_MS = 15_000

/** True when an API key is present, i.e. the AI layer can actually call Claude. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/** The model id used for generation (env-overridable). */
export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
}

export type GenerateTextOptions = {
  /** System prompt — sets the assistant's role and constraints. */
  system?: string
  /** The user turn. */
  prompt: string
  /** Output cap. Keep tight for short, cheap generations. */
  maxTokens?: number
  /** Override the default model for this call. */
  model?: string
  /** Abort the request after this many ms (default 15s). */
  timeoutMs?: number
}

type AnthropicContentBlock = { type?: string; text?: string }
type AnthropicResponse = {
  content?: AnthropicContentBlock[]
  stop_reason?: string
}

/**
 * Single-shot text generation. Returns the assembled text, or null on any
 * failure (missing key, HTTP error, refusal, timeout, malformed body).
 */
export async function generateText(
  opts: GenerateTextOptions,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model || aiModel(),
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: 'user', content: opts.prompt }],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[ai] Anthropic request failed ${res.status}: ${body.slice(0, 300)}`)
      return null
    }

    const data = (await res.json()) as AnthropicResponse

    // Safety classifiers can decline with a 200 + stop_reason "refusal".
    if (data.stop_reason === 'refusal') {
      console.warn('[ai] Anthropic declined the request (refusal)')
      return null
    }

    const text = (data.content ?? [])
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
      .trim()

    return text || null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[ai] Anthropic call errored: ${message}`)
    return null
  } finally {
    clearTimeout(timer)
  }
}
