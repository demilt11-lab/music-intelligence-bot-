// lib/firecrawl/client.ts
// Firecrawl API client for web scraping

const FIRECRAWL_BASE = 'https://api.firecrawl.dev/v1';

function getApiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error('Missing required env var: FIRECRAWL_API_KEY');
  return key;
}

export interface FirecrawlScrapeOptions {
  formats?: ('markdown' | 'html' | 'rawHtml' | 'links' | 'screenshot')[];
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  waitFor?: number;
}

export interface FirecrawlScrapeResult {
  success: boolean;
  data?: {
    markdown?: string;
    html?: string;
    rawHtml?: string;
    links?: string[];
    metadata?: {
      title?: string;
      description?: string;
      url?: string;
      statusCode?: number;
    };
  };
  error?: string;
}

/** Scrape a single URL and return its content */
export async function scrapeUrl(
  url: string,
  options: FirecrawlScrapeOptions = {},
): Promise<FirecrawlScrapeResult> {
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: options.formats ?? ['markdown'],
      onlyMainContent: options.onlyMainContent ?? true,
      ...(options.includeTags ? { includeTags: options.includeTags } : {}),
      ...(options.excludeTags ? { excludeTags: options.excludeTags } : {}),
      ...(options.waitFor ? { waitFor: options.waitFor } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firecrawl scrape failed (${res.status}): ${body}`);
  }

  return res.json() as Promise<FirecrawlScrapeResult>;
}
