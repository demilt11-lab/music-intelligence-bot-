// lib/luminate/client.ts

import { LuminateMetricsResponse } from './types';

const LUMINATE_BASE_URL = process.env.LUMINATE_BASE_URL ?? '';
const LUMINATE_API_KEY = process.env.LUMINATE_API_KEY ?? '';

if (!LUMINATE_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('[luminate] LUMINATE_BASE_URL is not set');
}

export type LuminateQueryParams = Record<string, string | number | boolean | undefined>;

function buildQuery(params: LuminateQueryParams): string {
  const searchParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    searchParams.append(k, String(v));
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

async function fetchJson<T>(path: string, params: LuminateQueryParams): Promise<T> {
  const url = `${LUMINATE_BASE_URL}${path}${buildQuery(params)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${LUMINATE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[luminate] ${res.status} ${res.statusText}: ${text}`);
  }

  return (await res.json()) as T;
}

// Streams (consumption) – you’d align paths to your Luminate endpoints
export async function fetchLuminateStreams(
  path: string,
  params: LuminateQueryParams,
): Promise<LuminateMetricsResponse> {
  return fetchJson<LuminateMetricsResponse>(path, params);
}

// Product sales
export async function fetchLuminateSales(
  path: string,
  params: LuminateQueryParams,
): Promise<LuminateMetricsResponse> {
  return fetchJson<LuminateMetricsResponse>(path, params);
}

// Airplay
export async function fetchLuminateAirplay(
  path: string,
  params: LuminateQueryParams,
): Promise<LuminateMetricsResponse> {
  return fetchJson<LuminateMetricsResponse>(path, params);
}
