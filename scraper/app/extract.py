import re
from urllib.parse import urlparse

import phonenumbers

from .models import Contact

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
WHATSAPP_RE = re.compile(r"(?:wa\.me|api\.whatsapp\.com/send)[^\s\"'<>]*")

_IGNORE_EMAIL_PREFIXES = ("example@", "test@", "noreply@", "no-reply@", "email@", "user@", "name@", "your@")
_ROLE_LABELS = ("sales", "export", "purchase", "info", "business", "marketing", "support")

# Free providers a real Indian company might legitimately use.
_FREE_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "hotmail.com",
    "outlook.com", "live.com", "rediffmail.com", "ymail.com", "icloud.com", "protonmail.com",
}
# Tracking / template / placeholder domains that leak into page HTML.
_JUNK_EMAIL_DOMAINS = {
    "sentry.io", "sentry.wixpress.com", "wixpress.com", "example.com", "example.org",
    "domain.com", "email.com", "yourdomain.com", "company.com", "sentry-next.wixpress.com",
}
_IMG_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico")

# Per-lead caps so a noisy site can't produce hundreds of contacts.
_MAX_EMAILS = 8
_MAX_PHONES = 8
_MAX_WHATSAPP = 4


def domain_of(url: str) -> str:
    return urlparse(url).hostname.replace("www.", "") if urlparse(url).hostname else url


def label_for_email(email: str) -> str:
    local = email.split("@", 1)[0].lower()
    for role in _ROLE_LABELS:
        if role in local:
            return "sales" if role in ("sales", "business", "marketing") else role
    return "unknown"


def extract_contacts(html: str, source_url: str) -> list[Contact]:
    contacts: list[Contact] = []
    seen: set[str] = set()

    for raw in EMAIL_RE.findall(html):
        email = raw.lower()
        if email in seen or email.startswith(_IGNORE_EMAIL_PREFIXES) or email.endswith(_IMG_EXTS):
            continue
        domain = email.split("@", 1)[1]
        if domain in _JUNK_EMAIL_DOMAINS:
            continue
        seen.add(email)
        contacts.append(
            Contact(type="email", value=email, label=label_for_email(email),
                    sourceUrl=source_url, confidence=80)
        )

    for match in phonenumbers.PhoneNumberMatcher(html, "IN"):
        # PhoneNumberMatcher is greedy — keep only valid Indian (+91) numbers.
        # This drops parsed integers and stray foreign country codes (e.g. +247).
        if match.number.country_code != 91 or not phonenumbers.is_valid_number(match.number):
            continue
        e164 = phonenumbers.format_number(match.number, phonenumbers.PhoneNumberFormat.E164)
        if e164 in seen:
            continue
        seen.add(e164)
        contacts.append(Contact(type="phone", value=e164, sourceUrl=source_url, confidence=70))

    for wa in WHATSAPP_RE.findall(html):
        if wa in seen:
            continue
        seen.add(wa)
        contacts.append(Contact(type="whatsapp", value=wa, sourceUrl=source_url, confidence=60))

    return contacts


def _email_belongs(email: str, company_domain: str) -> bool:
    """Keep company-domain emails and free-provider emails; drop cross-domain spam
    (e.g. support@maxwin25.com scraped from an unrelated widget on the page)."""
    domain = email.split("@", 1)[1].lower()
    if domain in _FREE_EMAIL_DOMAINS:
        return True
    cd = (company_domain or "").lower()
    return bool(cd) and (domain == cd or domain.endswith("." + cd) or cd.endswith("." + domain))


def clean_contacts(contacts: list[Contact], company_domain: str) -> list[Contact]:
    """Dedupe across pages, drop cross-domain spam emails, and cap counts per type.
    Runs after the whole site is crawled, where the company domain is known."""
    best: dict[tuple[str, str], Contact] = {}
    for c in contacts:
        if c.type == "email" and not _email_belongs(c.value, company_domain):
            continue
        key = (c.type, c.value.lower())
        prev = best.get(key)
        if prev is None or (c.confidence or 0) > (prev.confidence or 0):
            best[key] = c

    cleaned = list(best.values())
    # Role-labeled and company-domain emails first, then by confidence.
    emails = sorted(
        (c for c in cleaned if c.type == "email"),
        key=lambda c: (c.label == "unknown", -(c.confidence or 0)),
    )[:_MAX_EMAILS]
    phones = sorted(
        (c for c in cleaned if c.type == "phone"),
        key=lambda c: -(c.confidence or 0),
    )[:_MAX_PHONES]
    whatsapp = sorted(
        (c for c in cleaned if c.type == "whatsapp"),
        key=lambda c: -(c.confidence or 0),
    )[:_MAX_WHATSAPP]
    return emails + phones + whatsapp
