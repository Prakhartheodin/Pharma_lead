import json
import logging

from .config import config

log = logging.getLogger("classify")

# GPT-4o-mini classification on a compact cleaned snippet (see plan "GPT-4o-mini Usage").
# Deterministic extraction runs first; this only classifies relevance + drug match.

_SYSTEM = (
    "Context: we MANUFACTURE and SELL the active pharmaceutical ingredients (APIs) in the "
    "drug list, and want to find Indian companies we can SELL to. A company MATCHES a drug "
    "if it is a potential buyer or user of that API: it makes finished formulations/medicines "
    "containing the drug, uses it as a raw material, imports it, distributes/trades/markets it, "
    "or otherwise buys or sells it. (Other API/bulk-drug manufacturers of the SAME drug are "
    "competitors, not buyers — give them low confidence.) "
    "Put every drug from the list the company appears to buy, use, formulate, import, distribute, "
    "or sell into matchedDrugs. "
    "businessType: 'buyer' = formulation maker / importer / trader that consumes the API; "
    "'distributor' = wholesaler/stockist; 'manufacturer' = makes the API itself (competitor); "
    "'exporter'/'supplier' as applicable. "
    "Return STRICT JSON only: "
    '{"companyName":string|null,"isPharmaCompany":bool,"matchedDrugs":[string],'
    '"businessType":"manufacturer|supplier|exporter|distributor|buyer|unknown",'
    '"city":string|null,"state":string|null,"confidence":0-100,"reason":string}'
)


def classify(drug_list: list[str], company_name: str | None, page_url: str,
             clean_text: str, emails: list[str], phones: list[str]) -> dict:
    """Returns the classification dict. On any failure -> unknown/confidence 0 (never raises)."""
    if not config.openai_api_key:
        return {"isPharmaCompany": False, "matchedDrugs": [], "businessType": "unknown",
                "confidence": 0, "reason": "no OPENAI_API_KEY"}

    payload = {
        "drugList": drug_list,
        "companyCandidate": company_name,
        "pageUrl": page_url,
        "cleanTextSnippet": clean_text[:5000],
        "emailsFound": emails[:10],
        "phonesFound": phones[:10],
    }
    try:
        from openai import OpenAI

        client = OpenAI(api_key=config.openai_api_key)
        resp = client.chat.completions.create(
            model=config.openai_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": json.dumps(payload)},
            ],
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as exc:  # noqa: BLE001 — never fail the crawl on classification
        log.warning("classify failed for %s: %s", page_url, exc)
        return {"isPharmaCompany": False, "matchedDrugs": [], "businessType": "unknown",
                "confidence": 0, "reason": f"error: {exc}"}
