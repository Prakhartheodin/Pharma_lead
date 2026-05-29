# Manufacturer → Buyer Leads (Phase 1) — Requirements

**Date:** 2026-05-29 (rev. Codex preflight)  
**Client:** Drug manufacturer selling products listed in the drug dropdown; needs **buyers** and **email** outreach.  
**Scope:** Existing **Leads** screen (Search + Contacts tabs) and existing **Outreach** screen only. **No new pages** (no dashboard, map, settings, etc.).

## Preflight fixes (Codex review — validated)

| Issue | Verdict | Fix |
|-------|---------|-----|
| Gmail send uses `bodyHtml`, missing tokens | **Confirmed** | `sendMessage` expects `{ html }`; load account with `.select('+accessToken +refreshToken')`; scope by `req.userId` via `requireUser` |
| Send before lead validation | **Confirmed** | Fetch lead first; reject missing lead + `doNotContact`; update lead only after Gmail succeeds |
| Confidence `>= 0.7` | **Confirmed wrong** | Lead confidence is **0–100** (`ui.tsx` uses 75/45 thresholds); use **`>= 70`** for “strong match” |
| Template `{drugs}` syntax | **Confirmed wrong** | Interpolation is `{{matched_drugs}}` etc. (`Outreach.tsx`); reuse existing `DEFAULT_TEMPLATES` |
| Client-only CSV + 200 cap | **Confirmed** | **Server CSV export required** for saved buyers (`GET /v1/pharma-leads/export?saved=true`) |

## Problem

The app discovers companies and crawls contacts, but the UX still reads like generic “lead discovery.” The manufacturer needs a **buyer book** workflow: find buyers for drugs they make, qualify by email/drug match, save, email, and track who was already pitched.

## Goals

1. **Buyer-first discovery** — default search targets buyers/importers/distributors; copy reflects “find buyers for your products.”
2. **Faster triage on Search** — filter/sort without re-running discovery; summary stats after each search.
3. **Contacts as buyer book** — notes, export, pipeline status visible in the same Leads screen.
4. **Email loop closed** — sending email sets `contacted`; templates use manufacturer variables; bulk outreach respects “not yet contacted.”

## Non-goals (this phase)

- New routes/pages (dashboard, map, analytics, team/users).
- Gmail thread sync or open tracking.
- Full CRM (quoted/won/lost pipeline columns UI).
- Search presets persisted server-side.
- Pause/cancel crawl (API TODOs remain).

## User stories

| ID | As a manufacturer I want to… | So that… |
|----|------------------------------|----------|
| U1 | Default search to find **buyers** | I don’t waste time on other manufacturers |
| U2 | See **how many buyers have email** after a search | I know if the run was useful |
| U3 | **Filter/sort** search results (email, confidence) | I contact the best buyers first |
| U4 | **Save** good buyers to Contacts | I build a repeatable buyer list |
| U5 | Add **notes** on a saved buyer | I remember MOQ/pricing conversations |
| U6 | **Email** a buyer with a drug-aware template | I pitch the right product |
| U7 | Have the app mark buyers **contacted** after send | I don’t double-email |
| U8 | **Export** my Contacts to CSV | I can share with my team |
| U9 | **Bulk email** only uncontacted buyers with email | I run efficient outreach batches |

## Data model additions (`PharmaLead`)

| Field | Type | Purpose |
|-------|------|---------|
| `notes` | `string` | Free-text buyer notes (Contacts) |
| `lastPitchedAt` | `Date` | Last successful outreach send |
| `lastPitchedDrugs` | `string[]` | Drugs mentioned in last send |
| `doNotContact` | `boolean` | Exclude from bulk email |

Existing `status` enum keeps `new | contacted | replied | …`; sending sets `contacted`.

## API additions

| Method | Path | Purpose |
|--------|------|---------|
| `PATCH` | `/v1/pharma-leads/:id` | Update `notes`, `doNotContact` |
| `POST` | `/v1/pharma-campaigns/send` | `requireUser` + scoped account + lead preflight + Gmail send + lead update |
| `GET` | `/v1/pharma-leads/export?saved=true` | **Required** — full CSV of all saved buyers (no 200-row cap) |

`POST /v1/pharma-campaigns/send-test` — same handler as `/send` (frontend already calls this path).

## Reuse (do not rebuild)

- Search / Contacts tabs, load-more exclusion, buyer query terms (`googlePlaces.provider.ts`)
- `LeadDrawer` contact provenance + **source pages** (`sourceUrls`, per-contact `sourceUrl`)
- `DEFAULT_TEMPLATES` in `pharmaTemplates.routes.ts` (double-brace variables)
- Gmail OAuth + `listAccounts` (`email.routes.ts`)
- Bulk outreach UI (`Outreach.tsx`, `Leads` → `onBulkEmail`)

## UI scope (files)

| Area | File(s) |
|------|---------|
| Leads Search | `frontend/src/screens/Leads.tsx`, `index.css` |
| Lead detail | `frontend/src/components/LeadDrawer.tsx` |
| Outreach | `frontend/src/screens/Outreach.tsx` |
| API client | `frontend/src/lib/api.ts`, `types.ts` |
| Backend | `pharmaLead.model.ts`, `pharmaLeads.routes.ts`, new `pharmaCampaigns.routes.ts` |

## Success criteria

- New user can run search with buyer default, see summary, filter to “has email,” save, add note, email, see status `contacted`, export CSV — without leaving Leads/Outreach views.
- No regression to load-more search or save/star behavior.

## Open assumption

Primary market **India domestic + export** — search keeps city/state + geolocation; templates mention supply/MOQ generically (no country-specific legal copy in Phase 1).
