"""
services/crawler-api/main.py
crawl4ai-backed crawling microservice.

Wraps crawl4ai's AsyncWebCrawler (a real headless-browser crawler, via
Playwright) behind a small FastAPI surface so the Next.js app
(lib/crawler/client.ts) can request a page's markdown / a CSS-extracted
structured payload without embedding a headless browser in the Node
process. Used by jobs/ingest/{billboard,crawl_dsp_apple,crawl_social_x,
crawl_radio_spins}.ts to reach pages that block plain HTTP fetches
(DSP web players, social profiles) or that only render content via JS.

ASSUMPTION: deployed as its own long-lived process (Railway/Fly.io, same
posture as services/ar-api), with Playwright's Chromium installed via
`python -m playwright install --with-deps chromium` at build time.
"""

import json
import logging
import os
from typing import Any, Literal, Optional

from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("crawler_api")

# ---------------------------------------------------------------------------
# Auth — shared-secret bearer token. Mirrors the rest of the stack's posture
# (open in dev when unset; the caller, lib/crawler/client.ts, always sends
# the header when CRAWLER_API_KEY is configured in the Next.js env).
# ---------------------------------------------------------------------------

CRAWLER_API_KEY = os.environ.get("CRAWLER_API_KEY", "")


def _check_auth(authorization: Optional[str]) -> None:
    if not CRAWLER_API_KEY:
        return
    if authorization != f"Bearer {CRAWLER_API_KEY}":
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")


app = FastAPI(
    title="Crawler API",
    description="crawl4ai-backed web crawling service for DSP/social/radio/chart ingestion",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class ExtractField(BaseModel):
    name: str
    selector: str
    type: Literal["text", "attribute", "html"] = "text"
    attribute: Optional[str] = None


class ExtractSchema(BaseModel):
    name: str = "Extraction"
    base_selector: str = Field(..., alias="baseSelector")
    fields: list[ExtractField]

    model_config = {"populate_by_name": True}


class CrawlRequest(BaseModel):
    url: str
    wait_for: Optional[str] = Field(None, description="CSS (css:...) or JS (js:...) condition to wait for")
    wait_for_timeout_ms: Optional[int] = None
    css_selector: Optional[str] = Field(None, description="Scope extraction to this selector")
    js_code: Optional[list[str]] = Field(None, description="JS to run after page load, e.g. scroll/click")
    js_code_before_wait: Optional[list[str]] = Field(
        None,
        description="JS to run BEFORE wait_for is evaluated (e.g. an in-page fetch that produces the awaited element)",
    )
    scan_full_page: bool = Field(False, description="Auto-scroll to trigger lazy-loaded content")
    magic: bool = Field(True, description="Stealth mode: randomized UA, masks automation signals")
    delay_before_return_html_s: float = Field(0.5, description="Pause before capturing final HTML (SPA render time)")
    screenshot: bool = False
    page_timeout_ms: int = 30000
    extraction_schema: Optional[ExtractSchema] = None


class LinkEntry(BaseModel):
    href: str
    text: Optional[str] = None


class CrawlResponse(BaseModel):
    success: bool
    url: str
    status_code: Optional[int] = None
    markdown: Optional[str] = None
    extracted: Optional[Any] = None
    links: Optional[list[LinkEntry]] = None
    screenshot: Optional[str] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# /crawl
# ---------------------------------------------------------------------------


@app.post("/crawl", response_model=CrawlResponse)
async def crawl(req: CrawlRequest, authorization: Optional[str] = Header(None)) -> CrawlResponse:
    _check_auth(authorization)

    extraction_strategy = None
    if req.extraction_schema:
        schema = {
            "name": req.extraction_schema.name,
            "baseSelector": req.extraction_schema.base_selector,
            "fields": [f.model_dump(exclude_none=True) for f in req.extraction_schema.fields],
        }
        extraction_strategy = JsonCssExtractionStrategy(schema)

    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        wait_for=req.wait_for,
        wait_for_timeout=req.wait_for_timeout_ms,
        css_selector=req.css_selector,
        js_code=req.js_code,
        js_code_before_wait=req.js_code_before_wait,
        scan_full_page=req.scan_full_page,
        magic=req.magic,
        delay_before_return_html=req.delay_before_return_html_s,
        screenshot=req.screenshot,
        page_timeout=req.page_timeout_ms,
        extraction_strategy=extraction_strategy,
    )
    browser_config = BrowserConfig(headless=True)

    try:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=req.url, config=run_config)
    except Exception as exc:  # crawl4ai/Playwright can raise a wide range of errors
        logger.warning(f"crawl failed for {req.url}: {exc}")
        return CrawlResponse(success=False, url=req.url, error=str(exc))

    if not result.success:
        return CrawlResponse(
            success=False,
            url=req.url,
            status_code=getattr(result, "status_code", None),
            error=result.error_message,
        )

    markdown_text: Optional[str] = None
    if result.markdown:
        markdown_text = getattr(result.markdown, "raw_markdown", None) or str(result.markdown)

    extracted: Optional[Any] = None
    if result.extracted_content:
        try:
            extracted = json.loads(result.extracted_content)
        except (TypeError, ValueError):
            extracted = result.extracted_content

    links: Optional[list[LinkEntry]] = None
    if result.links:
        internal = result.links.get("internal", []) or []
        external = result.links.get("external", []) or []
        links = [
            LinkEntry(href=link.get("href", ""), text=link.get("text"))
            for link in [*internal, *external]
            if link.get("href")
        ]

    return CrawlResponse(
        success=True,
        url=req.url,
        status_code=result.status_code,
        markdown=markdown_text,
        extracted=extracted,
        links=links,
        screenshot=result.screenshot if req.screenshot else None,
    )


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8090, reload=True)
