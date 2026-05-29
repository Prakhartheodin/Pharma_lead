import logging
from urllib.parse import urljoin, urlparse

import phonenumbers

from .classify import classify
from .config import config
from .extract import clean_contacts, domain_of, extract_contacts
from .models import CompanySeed, Contact, CrawlRequest, LeadResult
from .netguard import is_public_url

log = logging.getLogger("crawler")

# High-priority in-domain paths (see plan).
PRIORITY_PATHS = [
    "/", "/contact", "/contact-us", "/about", "/about-us", "/products",
    "/product", "/manufacturing", "/exports", "/enquiry",
    "/business-enquiry", "/api", "/formulations",
]


# Cap total fetch attempts per company (404s on .html probing shouldn't run wild).
MAX_FETCH_ATTEMPTS = 20


def _final_url(page, requested: str) -> str:
    """The URL the response actually came from — preserves redirects to e.g.
    /clients.html so we never store a stripped, mis-routing URL."""
    return getattr(page, "url", None) or requested


def _fetch(url: str) -> tuple[str | None, bool, str]:
    """Fetch tiering: fast static first, StealthyFetcher fallback.
    Returns (html, used_stealth, final_url). Only HTTP 200 counts as a hit, so a
    404 page (common when probing /contact on a /contact.html site) is skipped.
    """
    from scrapling.fetchers import Fetcher, StealthyFetcher

    try:
        page = Fetcher.get(url, timeout=15)
        status = int(getattr(page, "status", 200) or 200)
        html = page.html_content if hasattr(page, "html_content") else str(page)
        if status == 200 and html and len(html) > 500 and "challenge" not in html.lower():
            return html, False, _final_url(page, url)
    except Exception as exc:  # noqa: BLE001
        log.debug("static fetch failed %s: %s", url, exc)

    # Fallback: stealth (Cloudflare/anti-bot). Capped per domain by the caller.
    try:
        page = StealthyFetcher.fetch(url, solve_cloudflare=True, timeout=30)
        status = int(getattr(page, "status", 200) or 200)
        html = page.html_content if hasattr(page, "html_content") else str(page)
        if status == 200 and html:
            return html, True, _final_url(page, url)
        return None, True, url
    except Exception as exc:  # noqa: BLE001
        log.warning("stealth fetch failed %s: %s", url, exc)
        return None, True, url


def crawl_company(req: CrawlRequest, seed: CompanySeed) -> LeadResult:
    base = seed.website
    domain = domain_of(base)
    contacts: list[Contact] = []
    source_urls: list[str] = []
    clean_text_parts: list[str] = []
    stealth_used = 0

    # Seed phone from Places (present even if the crawl finds nothing).
    # Normalize to E164 so it dedupes against the same number found on-site.
    if seed.phone:
        seed_phone = seed.phone
        try:
            num = phonenumbers.parse(seed.phone, "IN")
            if phonenumbers.is_valid_number(num):
                seed_phone = phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)
        except Exception:  # noqa: BLE001
            pass
        contacts.append(Contact(type="phone", value=seed_phone, label="unknown",
                                sourceUrl=base, source="google_places", confidence=85))

    # Each group is a set of URL variants for one logical page; we try them in
    # order and keep the first that returns HTTP 200. Many Indian pharma sites are
    # static, so /contact may 404 while /contact.html is the real page.
    target_groups: list[list[str]] = [[base]]  # exact seed first — preserves its .html
    for path in PRIORITY_PATHS:
        if path == "/":
            target_groups.append([urljoin(base, path)])
        else:
            target_groups.append([urljoin(base, path), urljoin(base, path + ".html")])

    pages = 0
    attempts = 0
    for group in target_groups:
        if pages >= config.max_pages_per_domain or attempts >= MAX_FETCH_ATTEMPTS:
            break
        if stealth_used >= config.max_stealth_attempts_per_domain:
            break
        for url in group:
            if pages >= config.max_pages_per_domain or attempts >= MAX_FETCH_ATTEMPTS:
                break
            if urlparse(url).hostname is None:
                continue
            if not is_public_url(url):  # SSRF guard — skip internal/private targets
                log.warning("skipping non-public url %s", url)
                continue
            attempts += 1
            html, used_stealth, final_url = _fetch(url)
            if used_stealth:
                stealth_used += 1
            if not html:
                continue  # 404/empty — try the next variant (e.g. the .html one)
            if domain_of(final_url) != domain:
                # Redirect left the company's own domain (e.g. an expired/parked
                # domain now pointing at a spam site) — its contacts aren't theirs.
                log.info("skipping off-domain redirect %s -> %s", url, final_url)
                continue
            if final_url in source_urls:
                break  # redirected to a page we already have; next group
            pages += 1
            source_urls.append(final_url)  # the REAL url, with its .html intact
            contacts.extend(extract_contacts(html, final_url))
            clean_text_parts.append(html[:3000])
            break  # got this page; move to the next group

    # Dedupe across pages, drop cross-domain spam emails, cap per type.
    contacts = clean_contacts(contacts, domain)

    emails = [c.value for c in contacts if c.type == "email"]
    phones = [c.value for c in contacts if c.type == "phone"]

    verdict = {}
    if emails or phones:
        verdict = classify(
            req.drugList, seed.companyName, base,
            "\n".join(clean_text_parts), emails, phones,
        )

    return LeadResult(
        jobId=req.jobId,
        companyName=verdict.get("companyName") or seed.companyName,
        website=base,
        domain=domain,
        matchedDrugs=verdict.get("matchedDrugs", []),
        businessType=verdict.get("businessType", "unknown"),
        city=verdict.get("city") or seed.city or req.city,
        state=verdict.get("state") or seed.state or req.state,
        confidence=int(verdict.get("confidence", 0)),
        contacts=contacts,
        sourceUrls=source_urls,
    )
