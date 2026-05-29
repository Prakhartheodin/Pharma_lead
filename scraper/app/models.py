from typing import Optional
from pydantic import BaseModel, Field


class CompanySeed(BaseModel):
    website: str
    companyName: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    # City/state from Google Places — used to fill the lead's location when GPT doesn't.
    city: Optional[str] = None
    state: Optional[str] = None


class CrawlLimits(BaseModel):
    maxPagesPerDomain: int = Field(default=10, ge=1, le=50)
    maxDepth: int = Field(default=2, ge=1, le=4)
    # bounded — caller cannot dictate unbounded concurrency (DoS guard)
    globalConcurrency: int = Field(default=4, ge=1, le=8)


class CrawlRequest(BaseModel):
    jobId: str
    drugList: list[str]
    city: Optional[str] = None
    state: Optional[str] = None
    # bounded list length to cap work per job
    companies: list[CompanySeed] = Field(..., max_length=500)
    limits: CrawlLimits = CrawlLimits()
    # NOTE: no callbackUrl. The callback target is derived from the scraper's own
    # config (config.ingest_url), never from the request body — a caller-supplied
    # URL would receive the X-Worker-Secret and could exfiltrate it.


class Contact(BaseModel):
    type: str  # email | phone | whatsapp
    value: str
    label: str = "unknown"
    sourceUrl: Optional[str] = None
    # where this contact came from: "crawl" (scraped page) or "google_places" (seed)
    source: str = "crawl"
    confidence: int = 0


class LeadResult(BaseModel):
    jobId: str
    companyName: Optional[str] = None
    website: str
    domain: str
    matchedDrugs: list[str] = []
    businessType: str = "unknown"
    city: Optional[str] = None
    state: Optional[str] = None
    confidence: int = 0
    contacts: list[Contact] = []
    sourceUrls: list[str] = []
