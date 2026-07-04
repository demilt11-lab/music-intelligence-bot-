// app/api/ar-bot/chat/route.ts
//
// UI-facing endpoint for Buddy's A&R bot. Runs one turn of the Claude
// tool-calling loop (lib/ai/agent.ts) against services/ar-api's tools
// (lib/bot/tools.ts + lib/bot/execute.ts). Stateless: the client resends
// the full message history each turn, same as there being no server-side
// session store for chat elsewhere in this app.

import { NextRequest, NextResponse } from 'next/server';
import { runArBotAgent, type ChatMessage } from '@/lib/ai/agent';
import { isAiConfigured } from '@/lib/ai/anthropic';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_MESSAGE_LEN = 2000;
const MAX_HISTORY = 20;

function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MAX_HISTORY)
    .map((m) => {
      const obj = (m ?? {}) as Record<string, unknown>;
      const role: ChatMessage['role'] = obj.role === 'assistant' ? 'assistant' : 'user';
      const content = typeof obj.content === 'string' ? obj.content.slice(0, MAX_MESSAGE_LEN) : '';
      return { role, content };
    })
    .filter((m) => m.content.length > 0);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const message =
      typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_LEN) : '';

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    if (!isAiConfigured()) {
      return NextResponse.json({
        obj: { reply: null, toolResults: [] },
        meta: { aiConfigured: false },
      });
    }

    const history = sanitizeHistory(body.history);
    const result = await runArBotAgent(message, history);

    return NextResponse.json({
      obj: { reply: result.reply, toolResults: result.toolResults, error: result.error },
      meta: { aiConfigured: true },
    });
  } catch (err) {
    console.error('[ar-bot/chat]', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
