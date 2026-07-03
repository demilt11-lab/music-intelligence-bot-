# crawler-api

A small FastAPI wrapper around [crawl4ai](https://github.com/unclecode/crawl4ai)
that exposes a single `/crawl` endpoint. It gives the Next.js app a real
headless-browser crawler (Playwright under the hood) for pages that block
plain HTTP fetches or only render content via JavaScript — DSP web players,
social profiles, radio station sites, chart sites.

Deployed and consumed the same way as `services/ar-api`: it's a standalone
process the Next.js app calls over HTTP (`lib/crawler/client.ts`), not
bundled into the Next.js build.

## Local development

```bash
cd services/crawler-api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m playwright install --with-deps chromium

uvicorn main:app --host 0.0.0.0 --port 8090 --reload
```

Point the Next.js app at it:

```
CRAWLER_API_URL="http://localhost:8090"
# CRAWLER_API_KEY unset locally — auth is a no-op when the key is empty
```

## API

### `POST /crawl`

```json
{
  "url": "https://example.com/chart",
  "wait_for": null,
  "css_selector": null,
  "js_code": null,
  "scan_full_page": false,
  "magic": true,
  "delay_before_return_html_s": 0.5,
  "screenshot": false,
  "page_timeout_ms": 30000,
  "extraction_schema": null
}
```

- `magic: true` enables crawl4ai's stealth mode (randomized user agent,
  masked automation signals) — needed for sites with basic bot detection
  (Apple Music, X/Twitter, etc).
- `extraction_schema` is optional. When set, crawl4ai runs a
  `JsonCssExtractionStrategy` and the response's `extracted` field holds the
  structured result. When omitted, callers fall back to heuristic parsing of
  `markdown` (see `jobs/ingest/billboard.ts` for the pattern) — more
  resilient against sites with obfuscated/hashed CSS class names.

Response:

```json
{
  "success": true,
  "url": "https://example.com/chart",
  "status_code": 200,
  "markdown": "...",
  "extracted": null,
  "links": [{ "href": "https://...", "text": "..." }],
  "screenshot": null,
  "error": null
}
```

### `GET /health`

`{"status": "ok"}`

## Auth

If `CRAWLER_API_KEY` is set, `/crawl` requires `Authorization: Bearer <key>`.
If unset, the endpoint is open (matches `services/ar-api`'s dev posture —
do not deploy publicly without setting a key).

## Deployment

Same posture as `services/ar-api` (see `DEPLOYMENT.md` § ML service): deploy
as a separate process on Railway/Fly.io/similar, run
`python -m playwright install --with-deps chromium` at build time, and set
`CRAWLER_API_URL` (+ `CRAWLER_API_KEY`) in the Next.js app's environment.
