// lib/ai/agent.ts
//
// Claude tool-calling loop for Buddy's A&R bot. lib/ai/anthropic.ts's
// generateText is deliberately single-shot (no tools) and other callers
// depend on that simplicity, so this is a separate entry point: it drives
// the Anthropic Messages API's tool-use loop against ANTHROPIC_BOT_TOOLS
// (lib/bot/tools.ts), executing each call via lib/bot/execute.ts against
// services/ar-api, until Claude produces a final text answer or the
// iteration cap is hit.
//
// Fails soft everywhere, same posture as anthropic.ts: no key, no ar-api,
// or any request failure surfaces as `reply: null` + an error string, never
// a fabricated answer.

import { aiModel } from './anthropic';
import { ANTHROPIC_BOT_TOOLS, type BotTool } from '@/lib/bot/tools';
import { executeBotTool, type ToolExecutionResult } from '@/lib/bot/execute';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOOL_ITERATIONS = 4;
const DEFAULT_TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are Buddy, an A&R scouting assistant for a music intelligence platform.
You have tools to search artists by breakout/heat scores, explain why a specific artist is scoring
the way it is, and (where available) suggest playlists to pitch. Use the tools whenever the user asks
about specific artists, scores, or scouting recommendations rather than guessing. Keep replies concise
(2-4 sentences plus, when useful, a short list) — the UI renders structured cards for tool results, so
don't re-transcribe every field back into prose. If a tool errors (e.g. the service isn't configured,
or an artist has no data yet), say so plainly instead of inventing numbers.`;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export interface AgentResult {
  reply: string | null;
  toolResults: ToolExecutionResult[];
  error?: string;
}

type TextBlock = { type: 'text'; text: string };
type ToolUseBlock = { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
type ToolResultBlock = { type: 'tool_result'; tool_use_id: string; content: string };
type AnthropicBlock = TextBlock | ToolUseBlock | ToolResultBlock;

type AnthropicMessage = { role: 'user' | 'assistant'; content: string | AnthropicBlock[] };

interface AnthropicToolResponse {
  content?: AnthropicBlock[];
  stop_reason?: string;
}

async function callAnthropic(
  messages: AnthropicMessage[],
  timeoutMs: number,
): Promise<AnthropicToolResponse | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel(),
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: ANTHROPIC_BOT_TOOLS,
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[ar-bot] Anthropic request failed ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }

    return (await res.json()) as AnthropicToolResponse;
  } catch (err) {
    console.error('[ar-bot] Anthropic call errored:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toBotTool(name: string, input: unknown): BotTool | null {
  const args = (input ?? {}) as Record<string, unknown>;
  if (name === 'search_artists' || name === 'explain_artist' || name === 'playlists_to_pitch') {
    return { name, arguments: args } as BotTool;
  }
  return null;
}

/** Run one user turn through Claude's tool-calling loop against the A&R bot tools. */
export async function runArBotAgent(
  userMessage: string,
  history: ChatMessage[] = [],
): Promise<AgentResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { reply: null, toolResults: [], error: 'ANTHROPIC_API_KEY is not configured.' };
  }

  const messages: AnthropicMessage[] = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  const allToolResults: ToolExecutionResult[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await callAnthropic(messages, DEFAULT_TIMEOUT_MS);
    if (!data) {
      return {
        reply: null,
        toolResults: allToolResults,
        error: 'Buddy is unavailable right now — check ANTHROPIC_API_KEY and try again.',
      };
    }

    const content = data.content ?? [];
    const toolUses = content.filter((b): b is ToolUseBlock => b.type === 'tool_use');

    if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const text = content
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
      return { reply: text || null, toolResults: allToolResults };
    }

    messages.push({ role: 'assistant', content });

    const toolResultBlocks: ToolResultBlock[] = [];
    for (const use of toolUses) {
      const tool = toBotTool(use.name, use.input);
      const result: ToolExecutionResult = tool
        ? await executeBotTool(tool)
        : { toolName: use.name, ok: false, error: `Unknown tool: ${use.name}` };

      allToolResults.push(result);
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(result.ok ? result.data : { error: result.error }),
      });
    }
    messages.push({ role: 'user', content: toolResultBlocks });
  }

  return {
    reply:
      "I pulled a lot of data on that but ran out of turns to summarize it — try narrowing your question.",
    toolResults: allToolResults,
  };
}
