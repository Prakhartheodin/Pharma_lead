import os
import sys

# Values that should never pass as a real secret.
INSECURE_SECRETS = ("", "change-me", "change-me-to-a-long-random-string")


class Config:
    worker_secret = os.getenv("PHARMA_WORKER_SECRET", "change-me")
    node_callback_base = os.getenv("NODE_CALLBACK_BASE", "http://localhost:3000").rstrip("/")
    openai_api_key = os.getenv("OPENAI_API_KEY", "")
    openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    checkpoint_dir = os.getenv("CHECKPOINT_DIR", "/app/checkpoints")

    # crawl limits (see plan "Crawler limits per company")
    max_pages_per_domain = 10
    max_depth = 2
    global_concurrency = 4
    max_stealth_attempts_per_domain = 3

    # hard caps on caller-supplied values (SSRF/DoS guard)
    max_companies_per_job = 500
    max_global_concurrency = 8

    @property
    def ingest_url(self) -> str:
        # Callback is derived from OUR config, never from the request body — a
        # caller-supplied callbackUrl could exfiltrate the worker secret.
        return f"{self.node_callback_base}/internal/pharma-leads/ingest"

    @property
    def job_summary_url(self) -> str:
        return f"{self.node_callback_base}/internal/pharma-leads/job-summary"


config = Config()

# Mirror the api: the worker secret guards every api<->scraper call. Don't run prod on default.
# Use NODE_ENV to match the api (docker-compose sets NODE_ENV, not ENV).
if config.worker_secret in INSECURE_SECRETS:
    if os.getenv("NODE_ENV", "development") == "production":
        sys.exit("PHARMA_WORKER_SECRET must be set to a non-default value in production")
    print("[config] PHARMA_WORKER_SECRET is the insecure default — set it in .env", file=sys.stderr)
