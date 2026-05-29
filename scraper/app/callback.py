import asyncio
import logging

import httpx

from .config import config
from .models import LeadResult

log = logging.getLogger("callback")

# Callback contract (see plan): 3 retries w/ backoff, then disk-queue + continue.
_RETRY_BACKOFF = [2, 4, 8]


async def post_lead(lead: LeadResult) -> bool:
    # Target comes from OUR config, not the request — see config.ingest_url.
    callback_url = config.ingest_url
    headers = {"X-Worker-Secret": config.worker_secret}
    payload = lead.model_dump()
    async with httpx.AsyncClient(timeout=15) as client:
        for attempt, delay in enumerate([0, *_RETRY_BACKOFF]):
            if delay:
                await asyncio.sleep(delay)
            try:
                resp = await client.post(callback_url, json=payload, headers=headers)
                if resp.status_code == 400:
                    log.warning("ingest rejected (400) for %s; not retrying", lead.domain)
                    return False
                resp.raise_for_status()
                return True
            except Exception as exc:  # noqa: BLE001
                log.warning("ingest attempt %s failed for %s: %s", attempt, lead.domain, exc)
    # TODO: persist to disk queue and re-send on /resume (see plan).
    log.error("ingest permanently failed for %s; dropping to disk queue (TODO)", lead.domain)
    return False


async def post_summary(job_id: str, status: str, failed_domains: int) -> bool:
    """Tell the api a crawl job finished so it can flip status off 'running'."""
    headers = {"X-Worker-Secret": config.worker_secret}
    payload = {"jobId": job_id, "status": status, "failedDomains": failed_domains}
    async with httpx.AsyncClient(timeout=15) as client:
        for attempt, delay in enumerate([0, *_RETRY_BACKOFF]):
            if delay:
                await asyncio.sleep(delay)
            try:
                resp = await client.post(config.job_summary_url, json=payload, headers=headers)
                resp.raise_for_status()
                return True
            except Exception as exc:  # noqa: BLE001
                log.warning("job-summary attempt %s failed for %s: %s", attempt, job_id, exc)
    log.error("job-summary permanently failed for %s", job_id)
    return False
