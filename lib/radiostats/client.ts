// lib/radiostats/client.ts

const BASE_URL =
  process.env.SONGSTATS_API_BASE_URL ||
  'https://api.songstats.com/enterprise/v1';

function getApiKey(): string {
  const key = process.env.SONGSTATS_API_KEY;
  if (!key) throw new Error('SONGSTATS_API_KEY is not set');
  return key;
}

export class RadiostatsError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function parseBody(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function radiostatsGet<T>(
  path: string,
  params: Record<string, any> = {},
): Promise<T> {
  const url = new URL(path, BASE_URL);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(String(key), String(value));
    }
  });

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      apikey: getApiKey(), // Radiostats docs: `apikey` header
    },
  });

  const body = await parseBody(res);

  if (!res.ok) {
    if (res.status === 429) {
      throw new RadiostatsError(
        'Radiostats rate limit hit (429): too many requests',
        res.status,
        body,
      );
    }
    throw new RadiostatsError(
      `Radiostats error ${res.status}`,
      res.status,
      body,
    );
  }

  return body as T;
}

export async function radiostatsPost<T>(
  path: string,
  params: Record<string, any> = {},
): Promise<T> {
  const url = new URL(path, BASE_URL);

  // “Add Station” endpoint expects query parameters plus POST.[page:2]
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(String(key), String(value));
    }
  });

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      apikey: getApiKey(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br',
    },
    body: JSON.stringify({}), // params live in query string per docs.[page:2]
  });

  const body = await parseBody(res);

  if (!res.ok) {
    if (res.status === 429) {
      throw new RadiostatsError(
        'Radiostats rate limit hit (429): too many requests',
        res.status,
        body,
      );
    }
    throw new RadiostatsError(
      `Radiostats error ${res.status}`,
      res.status,
      body,
    );
  }

  return body as T;
}
