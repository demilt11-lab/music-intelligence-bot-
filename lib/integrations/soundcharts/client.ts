// lib/integrations/soundcharts/client.ts

export type HttpMethod = 'GET' | 'POST';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

export interface SoundchartsClientConfig {
  baseUrl?: string;
  appId: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  defaultHeaders?: Record<string, string>;
}

export interface RequestOptions {
  method?: HttpMethod;
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
}

export interface PaginatedParams {
  offset?: number;
  limit?: number;
}

export interface DateWindowParams {
  startDate?: string;
  endDate?: string;
}

export interface ApiEnvelope<T = unknown> {
  obj?: T;
  offset?: number;
  total?: number;
  cursor?: string | null;
  // keep it open-ended; Soundcharts uses extra fields per endpoint
  [key: string]: unknown;
}

function assertRequired(value: string | undefined, field: string) {
  if (!value || !value.trim()) throw new Error(`${field} is required`);
}

function appendQuery(url: URL, query?: QueryParams) {
  if (!query) return;

  for (const [key, raw] of Object.entries(query)) {
    if (raw === undefined || raw === null) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    for (const value of values) {
      if (value === undefined || value === null) continue;
      url.searchParams.append(key, String(value));
    }
  }
}

export class SoundchartsClient {
  readonly baseUrl: string;
  private readonly appId: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: SoundchartsClientConfig) {
    assertRequired(config.appId, 'appId');
    assertRequired(config.apiKey, 'apiKey');

    this.baseUrl = config.baseUrl ?? 'https://customer.api.soundcharts.com';
    this.appId = config.appId;
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.defaultHeaders = config.defaultHeaders ?? {};
  }

  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    appendQuery(url, options.query);

    const response = await this.fetchImpl(url.toString(), {
      method: options.method ?? 'GET',
      signal: options.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-App-Id': this.appId,
        'X-API-Key': this.apiKey,
        ...this.defaultHeaders,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Soundcharts request failed: ${response.status} ${response.statusText}${
          text ? ` - ${text}` : ''
        }`,
      );
    }

    return (await response.json()) as T;
  }
}
