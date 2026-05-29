import asyncio
import hmac
import logging

from fastapi import FastAPI, Header, HTTPException

from .callback import post_lead, post_summary
from .config import config
from .crawler import crawl_company
from .models import CrawlRequest

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("main")

app = FastAPI(title="Pharma Scraper", version="0.1.0")

# In-memory job state for MVP (see plan: Scrapling crawldir checkpoints replace a broker).
_jobs: dict[str, dict] = {}


def _require_secret(secret: str | None) -> None:
    # constant-time compare to avoid leaking the secret via timing
    if not hmac.compare_digest(secret or "", config.worker_secret):
        raise HTTPException(status_code=401, detail="bad worker secret")


@app.get("/health")
def health():
    return {"ok": True, "service": "scraper"}


async def _run_crawl(req: CrawlRequest) -> None:
    state = _jobs[req.jobId]
    sem = asyncio.Semaphore(req.limits.globalConcurrency)

    async def one(seed):
        async with sem:
            if state.get("status") == "paused":
                return
            # Scrapling fetch is sync; run off the event loop.
            lead = await asyncio.to_thread(crawl_company, req, seed)
            delivered = await post_lead(lead)  # target derived from config, not the request
            if delivered:
                state["crawled"] += 1
            else:
                state["failed"] += 1

    try:
        await asyncio.gather(*(one(s) for s in req.companies))
        final = "paused" if state.get("status") == "paused" else "completed"
    except Exception as exc:  # noqa: BLE001
        log.error("job %s crawl error: %s", req.jobId, exc)
        final = "failed"
    state["status"] = final
    log.info("job %s %s (%s domains, %s failed)", req.jobId, final, state["crawled"], state["failed"])
    # Tell the api the job is done so it stops showing 'running'.
    await post_summary(req.jobId, final, state["failed"])


@app.post("/crawl")
async def crawl(req: CrawlRequest, x_worker_secret: str | None = Header(default=None)):
    _require_secret(x_worker_secret)
    _jobs[req.jobId] = {"status": "running", "crawled": 0, "failed": 0, "total": len(req.companies)}
    # Fire-and-forget; results stream back via the callback.
    asyncio.create_task(_run_crawl(req))
    return {"jobId": req.jobId, "status": "running", "companies": len(req.companies)}


@app.get("/crawl/{job_id}/status")
def status(job_id: str, x_worker_secret: str | None = Header(default=None)):
    _require_secret(x_worker_secret)
    return _jobs.get(job_id, {"status": "unknown"})


# TODO (capability spike): map pause/resume/retry onto Scrapling crawldir checkpoints.
@app.post("/crawl/{job_id}/pause")
def pause(job_id: str, x_worker_secret: str | None = Header(default=None)):
    _require_secret(x_worker_secret)
    if job_id in _jobs:
        _jobs[job_id]["status"] = "paused"
    return {"jobId": job_id, "status": "paused"}


@app.post("/crawl/{job_id}/resume")
def resume(job_id: str, x_worker_secret: str | None = Header(default=None)):
    _require_secret(x_worker_secret)
    if job_id in _jobs:
        _jobs[job_id]["status"] = "running"
    return {"jobId": job_id, "status": "running"}
