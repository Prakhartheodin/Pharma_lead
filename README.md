# Pharma Lead Scraper + Gmail Outreach

A **sell-side lead-generation platform for a pharmaceutical API manufacturer**. You
sell a list of active pharmaceutical ingredients (APIs); the app finds Indian
companies that **buy / use / formulate / import / distribute** those drugs, extracts
their public contact details, and lets you reach out over your own connected Gmail.

> Pick a drug → discover demand-side companies near you (radius expands across India)
> → crawl their sites for emails/phones → AI classifies & matches the drug → star the
> good ones into **Contacts** → compose personalized outreach (single or bulk) from Gmail.

---

## Architecture

```
                 ┌──────────────┐         ┌──────────────────────┐
   Browser  ───▶ │  frontend    │  HTTP   │   api (Node/TS)      │
  (React UI)     │  React/Vite  │ ──────▶ │   Express  :3000     │
                 │   :3001      │         │  • discovery (Places)│
                 └──────────────┘         │  • job orchestration │
                                          │  • Gmail OAuth + send │
                                          │  • leads / templates  │
                                          └───────┬───────┬───────┘
                                                  │       │
                            internal worker call  │       │  Mongo
                        (X-Worker-Secret, no DB)   ▼       ▼
                                   ┌────────────────────┐ ┌──────────┐
                                   │ scraper (Python)   │ │ mongo 7  │
                                   │ FastAPI + Scrapling│ │  :27017  │
                                   │  :8000 (internal)  │ └──────────┘
                                   │ • crawl + extract  │
                                   │ • GPT-4o-mini class.│ ──▶ OpenAI
                                   └────────────────────┘
                                            │
                                            ├──▶ Google Places API (discovery)
                                            └──▶ target company websites (crawl)
```

| Service    | Tech                              | Container  | Port               |
|------------|-----------------------------------|------------|--------------------|
| `frontend` | React + Vite + TypeScript         | `frontend` | `3001`             |
| `api`      | Node + TypeScript (Express)       | `api`      | `3000`             |
| `scraper`  | Python + FastAPI + Scrapling      | `scraper`  | `8000` (internal)  |
| `mongo`    | MongoDB 7                         | `mongo`    | `27017`            |

Services talk over a private Docker network by name (`api`, `scraper`, `mongo`). The
scraper has **no public port** — only the `api` calls it, authenticated with a shared
`PHARMA_WORKER_SECRET`. The scraper has **no DB access**; it streams results back to
the api via an internal callback.

---

## How it works

1. **Discovery** — `api` queries **Google Places API (New)** Text Search for the
   chosen *company type* (Buyer/Formulator/Importer by default, since this is a
   sell-side tool) near the user. If City/State are blank it uses the browser's
   geolocation and **widens the radius 100 → 300 → … → 3500 km** (Haversine-banded,
   India-only) until at least 5 *new* (not-already-saved) companies are found.
2. **Crawl** — `api` dispatches the discovered companies to the `scraper`. Scrapling
   fetches priority pages (`/contact`, `/about`, `/products`, … and their `.html`
   variants), following redirects and recording the **real final URL** per contact.
3. **Extract** — emails / phones / WhatsApp are pulled out, validated (Indian `+91`
   numbers only), de-duplicated, capped, and stripped of cross-domain spam (e.g. a
   parked domain redirecting to a junk site is skipped).
4. **Classify** — **GPT-4o-mini** reads a cleaned snippet and decides whether the
   company is a **potential buyer/user** of the drug (formulator, importer, trader,
   distributor) — API competitors of the same molecule are scored low. It also fills
   `matchedDrugs`, `businessType`, and `city/state`.
5. **Stream & review** — leads stream into the **Search** tab live as they're crawled.
   You **star** the good ones, which moves them into **Contacts** (your saved book).
6. **Outreach** — In **Outreach** (gated behind a connected Gmail account) you pick
   companies from Contacts, apply a **Job Template** whose `{{variables}}` fill from
   each company's data, optionally **AI-draft** the body, and **send** — single or
   personalized **bulk**.

### Key behaviors
- **Contacts = saved book.** Search shows only the current search's *unsaved* finds;
  saving moves a company to Contacts. Saved companies are excluded from future
  discovery so you don't pay to re-find them.
- **Location backfill.** `POST /v1/pharma-leads/backfill-location` fills city/state
  for older leads using Places address components.
- **Re-crawl.** `POST /v1/pharma-leads/recrawl` refreshes contacts/URLs in place.

---

## Quick start

For live data you need a Google Cloud project (Places API New + Gmail API enabled,
OAuth client) and an OpenAI API key. Without external keys the stack still boots;
discovery/classification/email just stay inactive until the relevant keys are set.

**Step 0 — create env files** (both run modes need these):

```bash
cp api/.env.example api/.env
cp scraper/.env.example scraper/.env
# Fill in the keys (see tables below). Set the SAME long random
# PHARMA_WORKER_SECRET in BOTH files.
```

> The `.env.example` defaults already point at `localhost` (for running without
> Docker). `docker compose` overrides the host-to-host URLs with container DNS
> automatically, so the same `.env` works for both modes.

### Option A — With Docker (recommended)

Requires **Docker + Docker Compose**. One command builds and runs everything:

```bash
docker compose up --build
```

- Frontend → http://localhost:3001
- API → http://localhost:3000
- Scraper → internal only · MongoDB → `localhost:27017`

Stop with `Ctrl+C`; `docker compose down` to remove containers (data persists in the
`mongo-data` volume). Rebuild a single service: `docker compose up -d --build api`.

### Option B — Without Docker (local dev)

Requires **Node 20+**, **Python 3.12+**, and a local **MongoDB** (or a connection
string in `api/.env`). Run each service in its own terminal:

```bash
# 1. MongoDB — start your local instance (or Docker just for Mongo):
docker run -d -p 27017:27017 --name pharma-mongo mongo:7
#    (or use an existing mongod / MongoDB Atlas URL in api/.env)

# 2. Scraper (Python / FastAPI) — terminal 1
cd scraper
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
scrapling install            # one-time: installs the headless browser for crawling
uvicorn app.main:app --reload --port 8000

# 3. API (Node / Express) — terminal 2
cd api
npm install
npm run dev                  # tsx watch on http://localhost:3000

# 4. Frontend (React / Vite) — terminal 3
cd frontend
npm install
npm run dev                  # http://localhost:3001
```

- Frontend → http://localhost:3001  ·  API → http://localhost:3000  ·  Scraper → http://localhost:8000

With the `.env.example` defaults, the api reaches the scraper at `http://localhost:8000`
and Mongo at `mongodb://127.0.0.1:27017/pharma`, and the scraper calls back to
`http://localhost:3000` — no extra config needed for local dev.

---

## Environment variables

> ⚠️ **`api/.env` and `scraper/.env` hold real secrets and are git-ignored. Never commit
> them.** Only the `*.env.example` templates are tracked.

### `api/.env`
| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `development` / `production` (prod refuses a default worker secret) |
| `PORT` | API port (default `3000`) |
| `MONGODB_URL` | Mongo connection (compose sets `mongodb://mongo:27017/pharma`) |
| `SCRAPER_URL` | Scraper base URL (compose: `http://scraper:8000`) |
| `NODE_CALLBACK_BASE` | URL the scraper calls back to (compose: `http://api:3000`) |
| `PHARMA_WORKER_SECRET` | Shared secret for api↔scraper auth — **must match `scraper/.env`** |
| `GOOGLE_PLACES_API_KEY` | Google Places API (New) — discovery |
| `GOOGLE_PLACES_QUOTA_DAILY` | Informational only (the real cap lives in GCP) |
| `OPENAI_API_KEY` | Optional here (classification runs in the scraper) |
| `GCP_GOOGLE_CLIENT_ID` / `GCP_GOOGLE_CLIENT_SECRET` | Gmail OAuth client |
| `GCP_GOOGLE_REDIRECT_URI` | OAuth redirect (`…/v1/email/auth/google/callback`) |
| `CORS_ORIGIN` | Allowed frontend origin (default `http://localhost:3001`) |

### `scraper/.env`
| Variable | Purpose |
|----------|---------|
| `PHARMA_WORKER_SECRET` | Must match `api/.env` |
| `NODE_CALLBACK_BASE` | Where leads are streamed back (compose: `http://api:3000`) |
| `OPENAI_API_KEY` | GPT-4o-mini classification |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |
| `CHECKPOINT_DIR` | Scrapling crawl checkpoints (mounted volume) |

---

## Selected API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/pharma-leads/search` | Run discovery + crawl (body: `drugs[]`, `businessType`, `city`/`state` or `lat`/`lng`) |
| `GET`  | `/v1/pharma-leads/search/:jobId` | Job status + progress |
| `GET`  | `/v1/pharma-leads?saved=true&jobId=…` | List leads (filter by saved / job) |
| `PATCH`| `/v1/pharma-leads/:id/save` | Save / unsave a lead |
| `POST` | `/v1/pharma-leads/recrawl` | Re-crawl existing leads in place |
| `POST` | `/v1/pharma-leads/backfill-location` | Fill missing city/state via Places |
| `GET`/`POST` | `/v1/pharma-templates` | Outreach job templates |
| `GET`  | `/v1/email/auth/google` | Start Gmail OAuth |
| `GET`  | `/v1/email/accounts` · `DELETE /:id` | Connected mailboxes / disconnect |
| `POST` | `/internal/pharma-leads/ingest` | Worker → api lead callback (secret-gated) |

---

## Project structure

```
api/                     Node/TS backend (Express)
  src/
    routes/              pharma-leads, pharma-templates, pharma-campaigns, email, internal
    services/
      discovery/         Google Places provider (radius banding, India filter)
      email/             Gmail OAuth + send (ported), AI draft, templates
    models/              Mongo schemas (lead, job, template, email account)
scraper/                 Python FastAPI + Scrapling
  app/                   main, crawler, extract, classify (GPT), callback, netguard
frontend/                React + Vite
  src/
    screens/             Leads (Search/Contacts), Outreach, Mailbox, PersonalTemplates
    components/          DrugSelect, LeadDrawer, CompanyPicker, TemplatePicker, modals
    lib/                 api client, types, drug list
docker-compose.yml       Full local stack
```

---

## Notes & limitations

- **Google Places daily quota.** The default project cap is low (e.g. 100 Text
  Searches/day). Heavy searching/backfilling can exhaust it; raise it in GCP Console
  (Places API → Quotas). A failed search shows a clear in-app banner.
- **Email sending** requires a connected Gmail account (read + send scopes). Inbox,
  Compose, and Templates are all gated behind a connected mailbox; signing out removes
  the account.
- **Auth is a stand-in.** A demo `X-User-Id` header is mapped to a stable id; replace
  with real session/JWT auth before exposing publicly.

---

## License

Proprietary — internal project. Not for redistribution.
