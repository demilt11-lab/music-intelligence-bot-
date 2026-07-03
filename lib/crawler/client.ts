// lib/crawler/client.ts
//
// Client for the self-hosted crawl4ai crawling service (services/crawler-api).
// Used by ingest jobs that scrape DSP/social/radio/chart pages requiring a
// real headless browser (bot-detection bypass, JS-rendered content) rather
// than a plain fetch — see lib/firecrawl/client.ts for the equivalent
// hosted-API shape this mirrors.

import { fetchWithRetry } from '@/lib/http/retry';

function getBaseUrl(): string {
  const url = process.env.CRAWLER_API_URL;
  if (!url) throw new Error('Missing required env var: CRAWLER_API_URL');
  return url.replace(/\/$/, '');
}

export interface CrawlExtractField {
  name: string;
  selector: string;
  type?: 'text' | 'attribute' | 'html';
  attribute?: string;
}

export interface CrawlExtractSchema {
  name?: string;
  baseSelector: string;
  fields: CrawlExtractField[];
}

export interface CrawlOptions {
  /** CSS (`css:...`) or JS (`js:...`) condition to wait for before extracting content. */
  waitFor?: string;
  waitForTimeoutMs?: number;
  /** Scope markdown/extraction to this selector. */
  cssSelector?: string;
  /** JS to run after page load, e.g. scroll/click to reveal lazy content. */
  jsCode?: string[];
  /**
   * JS to run BEFORE the waitFor condition is evaluated — use when the
   * script itself produces whatever waitFor is waiting for (e.g. an in-page
   * API fetch that writes its result into the DOM).
   */
  jsCodeBeforeWait?: string[];
  /** Auto-scroll to trigger lazy-loaded content (infinite lists, playlists). */
  scanFullPage?: boolean;
  /** Stealth mode: randomized user agent, masks automation signals. Default true. */
  magic?: boolean;
  /** Pause before capturing final HTML — gives JS-heavy SPAs time to render. */
  delayBeforeReturnHtmlSeconds?: number;
  screenshot?: boolean;
  pageTimeoutMs?: number;
  extractionSchema?: CrawlExtractSchema;
}

export interface CrawlLink {
  href: string;
  text?: string;
}

export interface CrawlResult<T = unknown> {
  success: boolean;
  url: string;
  statusCode?: number;
  markdown?: string;
  extracted?: T;
  links?: CrawlLink[];
  screenshot?: string;
  error?: string;
}

/** Crawl a single URL through the crawl4ai service and return markdown + optional structured extraction. */
export async function crawlUrl<T = unknown>(
  url: string,
  options: CrawlOptions = {},
): Promise<CrawlResult<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = process.env.CRAWLER_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetchWithRetry(
    `${getBaseUrl()}/crawl`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url,
        wait_for: options.waitFor,
        wait_for_timeout_ms: options.waitForTimeoutMs,
        css_selector: options.cssSelector,
        js_code: options.jsCode,
        js_code_before_wait: options.jsCodeBeforeWait,
        scan_full_page: options.scanFullPage ?? false,
        magic: options.magic ?? true,
        delay_before_return_html_s: options.delayBeforeReturnHtmlSeconds ?? 0.5,
        screenshot: options.screenshot ?? false,
        page_timeout_ms: options.pageTimeoutMs ?? 30000,
        extraction_schema: options.extractionSchema
          ? {
              name: options.extractionSchema.name ?? 'Extraction',
              baseSelector: options.extractionSchema.baseSelector,
              fields: options.extractionSchema.fields,
            }
          : undefined,
      }),
    },
    { label: 'crawler-api', timeoutMs: 45_000 },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Crawler API request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return {
    success: data.success,
    url: data.url,
    statusCode: data.status_code,
    markdown: data.markdown,
    extracted: data.extracted,
    links: data.links,
    screenshot: data.screenshot,
    error: data.error,
  };
}
