// lib/bot/execute.ts
//
// Server-side execution of lib/bot/tools.ts's tool definitions against
// services/ar-api (the Predictive A&R API). tools.ts only ever defined
// schemas — nothing mapped a tool call to an actual request. This is that
// missing piece; lib/ai/agent.ts's Claude tool-calling loop calls it.

import { fetchWithRetry } from '@/lib/http/retry';
import type { BotTool } from './tools';

function getBaseUrl(): string {
  const url = process.env.AR_API_URL;
  if (!url) throw new Error('Missing required env var: AR_API_URL');
  return url.replace(/\/$/, '');
}

export interface ToolExecutionResult {
  toolName: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

function qs(params: Record<string, string | number | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

async function callArApi(path: string): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetchWithRetry(
      `${getBaseUrl()}${path}`,
      { method: 'GET' },
      { label: 'ar-api', timeoutMs: 20_000 },
    );
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      const detail =
        body && typeof body === 'object' && 'detail' in body
          ? String((body as { detail: unknown }).detail)
          : `ar-api request failed (HTTP ${res.status})`;
      return { ok: false, error: detail };
    }

    return { ok: true, data: body };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'ar-api request failed' };
  }
}

/** Execute a single lib/bot/tools.ts tool call against services/ar-api. */
export async function executeBotTool(tool: BotTool): Promise<ToolExecutionResult> {
  switch (tool.name) {
    case 'search_artists': {
      const a = tool.arguments;
      const path = `/artists/search${qs({
        min_heat: a.min_heat,
        min_breakout_prob: a.min_breakout_prob,
        max_monthly_listeners: a.max_monthly_listeners,
        genre: a.genre,
        country: a.country,
        order_by: a.order_by,
        limit: a.limit,
        score_date: a.score_date,
      })}`;
      return { toolName: tool.name, ...(await callArApi(path)) };
    }

    case 'explain_artist': {
      const a = tool.arguments;
      const path = `/artists/${a.artist_id}/explanation${qs({ score_date: a.score_date })}`;
      return { toolName: tool.name, ...(await callArApi(path)) };
    }

    case 'playlists_to_pitch': {
      const a = tool.arguments;
      const path = `/playlists_to_pitch${qs({ artist_id: a.artist_id, limit: a.limit })}`;
      return { toolName: tool.name, ...(await callArApi(path)) };
    }

    default: {
      const exhaustiveCheck: never = tool;
      return { toolName: (exhaustiveCheck as BotTool).name, ok: false, error: 'Unknown tool' };
    }
  }
}
