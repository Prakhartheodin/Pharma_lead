# Manufacturer → Buyer Leads (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Leads + Outreach flows into a **manufacturer → buyer** sales desk: buyer-first search, triage filters, buyer book with notes, working Gmail send that marks leads contacted, and CSV export — without adding new app pages.

**Architecture:** Extend `PharmaLead` with notes/pitch metadata; add minimal `pharmaCampaigns` router wrapping existing `gmailProvider.sendMessage`; keep all UX in `Leads.tsx` (Search/Contacts) and `Outreach.tsx` (email panel). Client-side filters/sort on loaded leads; optional server CSV endpoint or pure client export from `listLeads`.

**Tech Stack:** Node/Express/Mongoose API, React/Vite frontend, existing Gmail OAuth (`email.routes.ts`, `gmailProvider.ts`).

**Spec:** `docs/superpowers/specs/2026-05-29-manufacturer-buyer-leads-spec.md`

---

## Codex preflight review (validated against repo)

All five findings are **correct**. Apply these before implementation.

| # | Finding | Evidence | Plan fix |
|---|---------|----------|----------|
| 1 | Gmail send will fail | `accessToken`/`refreshToken` are `select: false` (`emailAccount.model.ts:11–12`); `sendMessage` takes `{ html }` not `bodyHtml` (`gmailProvider.ts:108–110`) | Task 3: `requireUser`, `findOne({ user: req.userId })`, `.select('+accessToken +refreshToken')`, pass `html` |
| 2 | Send order unsafe | Plan sent Gmail first, updated lead after | Task 3: load lead → reject `doNotContact` → send → update on success only |
| 3 | Confidence scale | UI treats 0–100 (`ui.tsx:8–14`); plan used `>= 0.7` | Task 5: `STRONG_MATCH_MIN = 70`; filter slider 0–100 |
| 4 | Template syntax | `interpolate` uses `{{key}}` (`Outreach.tsx:25–26`); seeds use `{{matched_drugs}}` (`pharmaTemplates.routes.ts:8–28`) | Task 8: **do not** add `{drugs}` templates; optional `buildContext` aliases only |
| 5 | CSV export incomplete | `GET /` capped at `.limit(200)` (`pharmaLeads.routes.ts:203`) | Task 6b: **server** `GET /export?saved=true` (no cap) |

### Reuse existing code (do not rework)

| Feature | Location |
|---------|----------|
| Search / Contacts split, load more | `Leads.tsx`, `pharmaLeads.routes.ts` |
| Buyer-oriented Places queries | `googlePlaces.provider.ts` `QUERY_TERMS.buyer` |
| Source pages + contact provenance | `LeadDrawer.tsx` (lines 67–84) |
| Outreach templates (seeded) | `pharmaTemplates.routes.ts` `DEFAULT_TEMPLATES` |
| Gmail connect + account list | `email.routes.ts` |
| Bulk outreach entry | `Leads.tsx` → `App.tsx` → `Outreach.tsx` |

---

## File map

| Responsibility | Create | Modify |
|----------------|--------|--------|
| Lead schema | — | `api/src/models/pharmaLead.model.ts` |
| Lead PATCH + notes | — | `api/src/routes/pharmaLeads.routes.ts` |
| Saved buyers CSV export | — | `api/src/routes/pharmaLeads.routes.ts` |
| Gmail send + status update | `api/src/routes/pharmaCampaigns.routes.ts` | `api/src/routes/index.ts` |
| Types | — | `frontend/src/lib/types.ts` |
| API client | — | `frontend/src/lib/api.ts` |
| Buyer-first Leads UX | — | `frontend/src/screens/Leads.tsx` |
| Notes + pitch in drawer | — | `frontend/src/components/LeadDrawer.tsx` |
| Send + templates + contacted | — | `frontend/src/screens/Outreach.tsx` |
| Shared filter/sort helpers | `frontend/src/lib/leadFilters.ts` | — |
| Styles | — | `frontend/src/index.css` |
| Templates | — | Reuse `pharmaTemplates.routes.ts` seeds; optional `buildContext` aliases only |

**Out of scope:** `App.tsx` nav structure stays (Leads + Outreach). Do not add `screens/Dashboard.tsx` or new sidebar items.

---

## Task 1: Extend PharmaLead model

**Files:**
- Modify: `api/src/models/pharmaLead.model.ts`

- [ ] **Step 1: Add fields to schema**

```typescript
notes: { type: String, default: '' },
lastPitchedAt: Date,
lastPitchedDrugs: { type: [String], default: [] },
doNotContact: { type: Boolean, default: false, index: true },
```

- [ ] **Step 2: Verify API starts**

Run: `cd api && npm run dev` (or `docker compose up api`)  
Expected: No schema crash; existing leads load with new defaults.

---

## Task 2: PATCH lead (notes, do-not-contact)

**Files:**
- Modify: `api/src/routes/pharmaLeads.routes.ts`

- [ ] **Step 1: Add Zod schema and route**

```typescript
const patchLeadSchema = z.object({
  notes: z.string().max(5000).optional(),
  doNotContact: z.boolean().optional(),
});

pharmaLeadsRouter.patch('/:leadId', async (req, res) => {
  const parsed = patchLeadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const lead = await PharmaLead.findByIdAndUpdate(
    req.params.leadId,
    { $set: parsed.data },
    { new: true }
  );
  if (!lead) return res.status(404).json({ error: 'not found' });
  res.json(lead);
});
```

Place **before** `GET /:leadId` if route order matters (Express matches in order — `/:leadId` must not swallow `export`).

- [ ] **Step 2: Manual test**

```bash
curl -X PATCH http://localhost:3000/v1/pharma-leads/<id> \
  -H "Content-Type: application/json" -H "X-User-Id: demo-user" \
  -d '{"notes":"MOQ 500kg discussed"}'
```

Expected: `200` with `notes` populated.

---

## Task 3: Implement Gmail send endpoint (preflight contract)

**Files:**
- Create: `api/src/routes/pharmaCampaigns.routes.ts`
- Modify: `api/src/routes/index.ts`

- [ ] **Step 1: Create router with shared handler**

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { requireUser } from '../middleware/requireUser.js';
import { PharmaLead } from '../models/pharmaLead.model.js';
import { EmailAccount } from '../models/emailAccount.model.js';
import { sendMessage } from '../services/email/gmailProvider.js';

export const pharmaCampaignsRouter = Router();
pharmaCampaignsRouter.use(requireUser);

const sendSchema = z.object({
  accountId: z.string(),
  leadId: z.string(),
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  drugs: z.array(z.string()).optional(),
});

async function handleSend(req: import('express').Request, res: import('express').Response) {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const lead = await PharmaLead.findById(parsed.data.leadId);
  if (!lead) return res.status(404).json({ error: 'lead not found' });
  if (lead.get('doNotContact')) {
    return res.status(409).json({ error: 'lead is marked do not contact' });
  }

  const account = await EmailAccount.findOne({
    _id: parsed.data.accountId,
    user: req.userId,
    status: 'active',
  }).select('+accessToken +refreshToken email provider status tokenExpiry user');
  if (!account) return res.status(404).json({ error: 'account not found' });

  const html = parsed.data.body.includes('<')
    ? parsed.data.body
    : parsed.data.body.replace(/\n/g, '<br/>');

  try {
    await sendMessage(account, {
      to: parsed.data.to,
      subject: parsed.data.subject,
      html,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: message });
  }

  const drugs = parsed.data.drugs ?? (lead.get('matchedDrugs') as string[]) ?? [];
  await PharmaLead.findByIdAndUpdate(lead.id, {
    status: 'contacted',
    lastPitchedAt: new Date(),
    lastPitchedDrugs: drugs,
  });

  res.json({ ok: true });
}

pharmaCampaignsRouter.post('/send', handleSend);
pharmaCampaignsRouter.post('/send-test', handleSend); // frontend compat
```

- [ ] **Step 2: Register router**

```typescript
import { pharmaCampaignsRouter } from './pharmaCampaigns.routes.js';
router.use('/pharma-campaigns', pharmaCampaignsRouter);
```

Remove `// TODO: /pharma-campaigns` in `index.ts`.

- [ ] **Step 3: Test send (Gmail connected, header `X-User-Id: demo-user`)**

POST `http://localhost:3000/v1/pharma-campaigns/send-test` with `accountId`, `leadId`, `to`, `subject`, `body`.  
Expected: `200 { ok: true }`; lead `status` → `contacted`; `lastPitchedAt` set.  
If `doNotContact: true` → `409` and **no** Gmail send.

---

## Task 4: Frontend types + API client

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Extend `PharmaLead` interface**

```typescript
notes?: string;
lastPitchedAt?: string;
lastPitchedDrugs?: string[];
doNotContact?: boolean;
```

- [ ] **Step 2: Add `patchLead` and update `sendEmail`**

```typescript
export async function patchLead(
  id: string,
  body: { notes?: string; doNotContact?: boolean }
): Promise<Result<PharmaLead>> { /* PATCH /v1/pharma-leads/:id */ }

export async function sendEmail(input: {
  accountId: string;
  leadId: string;
  to: string;
  subject: string;
  body: string;
  drugs?: string[];
}): Promise<Result<{ ok: boolean }>> {
  // POST /v1/pharma-campaigns/send
}
```

- [ ] **Step 3: Build frontend**

Run: `cd frontend && npm run build`  
Expected: PASS

---

## Task 5: Lead filter/sort helpers (client-side)

**Files:**
- Create: `frontend/src/lib/leadFilters.ts`

- [ ] **Step 1: Implement helpers**

```typescript
import type { PharmaLead } from './types';

export type LeadFilters = {
  hasEmail?: boolean;
  minConfidence?: number;
  hideSaved?: boolean;
  hideContacted?: boolean;
  hideDoNotContact?: boolean;
};

export type LeadSort = 'confidence' | 'company' | 'state';

export function filterLeads(leads: PharmaLead[], f: LeadFilters): PharmaLead[] {
  return leads.filter((l) => {
    if (f.hasEmail && !l.contacts.some((c) => c.type === 'email')) return false;
    if (f.minConfidence != null && l.confidence < f.minConfidence) return false;
    if (f.hideSaved && l.saved) return false;
    if (f.hideContacted && l.status === 'contacted') return false;
    if (f.hideDoNotContact && l.doNotContact) return false;
    return true;
  });
}

export function sortLeads(leads: PharmaLead[], sort: LeadSort): PharmaLead[] {
  const copy = [...leads];
  if (sort === 'confidence') copy.sort((a, b) => b.confidence - a.confidence);
  else if (sort === 'company') copy.sort((a, b) => a.companyName.localeCompare(b.companyName));
  else if (sort === 'state') copy.sort((a, b) => (a.state ?? '').localeCompare(b.state ?? ''));
  return copy;
}

/** Strong match threshold — confidence is 0–100 (see ui.tsx Confidence). */
export const STRONG_MATCH_MIN = 70;

export function searchSummary(leads: PharmaLead[]) {
  const withEmail = leads.filter((l) => l.contacts.some((c) => c.type === 'email')).length;
  const strong = leads.filter((l) => l.confidence >= STRONG_MATCH_MIN).length;
  return { total: leads.length, withEmail, strong };
}
```

Filter UI: `minConfidence` slider/options use **0, 45, 70** (align with `ui.tsx` warn/good breakpoints), never 0–1 fractions.

---

## Task 6: Buyer-first Leads screen

**Files:**
- Modify: `frontend/src/screens/Leads.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Default `businessType` to `'buyer'`**

```typescript
const [businessType, setBusinessType] = useState('buyer');
```

Reorder `COMPANY_TYPES` so Buyer / Importer / Distributor appear first.

- [ ] **Step 2: Update page copy**

- Title eyebrow: `Buyer discovery`
- Description: `Find buyers for the drugs you manufacture, save promising contacts, then email from Outreach.`
- Contacts tab label: `Buyer contacts` (button text)

- [ ] **Step 3: Add filter bar (Search tab only)**

State:

```typescript
const [filterHasEmail, setFilterHasEmail] = useState(false);
const [filterMinConf, setFilterMinConf] = useState(0);
const [sortBy, setSortBy] = useState<LeadSort>('confidence');
```

Pipeline:

```typescript
const searchRows = results.filter((l) => !l.saved);
const displayedSearch = sortLeads(
  filterLeads(searchRows, {
    hasEmail: filterHasEmail || undefined,
    minConfidence: filterMinConf || undefined,
  }),
  sortBy
);
```

Use `displayedSearch` in table; keep `searchSummary(searchRows)` on unfiltered set.

- [ ] **Step 4: Search summary strip**

After search completes (`!searching && activeJobId`), show:

```tsx
const summary = searchSummary(searchRows);
// “{summary.total} buyers · {summary.withEmail} with email · {summary.strong} strong matches”
```

- [ ] **Step 5: Contacts filters**

Same filters on `savedLeads`; add checkbox **Hide contacted** default off.

- [ ] **Step 6: Export button calls server CSV (Task 6b)**

Do **not** export from `listLeads` client state (200-row cap). Button triggers `exportSavedContacts()` → download from API.

- [ ] **Step 7: Bulk email guard**

Change `withEmail` to:

```typescript
savedLeads.filter((l) =>
  l.contacts.some((c) => c.type === 'email') &&
  l.status !== 'contacted' &&
  !l.doNotContact
)
```

Update button label: `Draft outreach (N uncontacted)`.

- [ ] **Step 8: Visual polish in `index.css`**

Add `.summary-strip`, `.filter-chips` (compact toggles) matching existing design tokens.

---

## Task 6b: Server CSV export (required)

**Files:**
- Modify: `api/src/routes/pharmaLeads.routes.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/screens/Leads.tsx`

- [ ] **Step 1: Add route before `GET /:leadId`**

```typescript
pharmaLeadsRouter.get('/export', async (req, res) => {
  if (req.query.saved !== 'true') {
    return res.status(400).json({ error: 'only saved=true is supported' });
  }
  const leads = await PharmaLead.find({ saved: true }).sort({ confidence: -1 }).lean();
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['company', 'domain', 'email', 'phone', 'drugs', 'status', 'city', 'state', 'notes', 'lastPitchedAt'];
  const lines = [header.join(',')];
  for (const raw of leads) {
    const l = raw as {
      companyName?: string; domain?: string; matchedDrugs?: string[]; status?: string;
      city?: string; state?: string; notes?: string; lastPitchedAt?: Date;
      contacts?: { type: string; value: string }[];
    };
    const email = l.contacts?.find((c) => c.type === 'email')?.value ?? '';
    const phone = l.contacts?.find((c) => c.type === 'phone')?.value ?? '';
    lines.push([
      esc(l.companyName), esc(l.domain), esc(email), esc(phone),
      esc((l.matchedDrugs ?? []).join('; ')), esc(l.status),
      esc(l.city), esc(l.state), esc(l.notes),
      esc(l.lastPitchedAt ? new Date(l.lastPitchedAt).toISOString() : ''),
    ].join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="buyer-contacts.csv"');
  res.send(lines.join('\n'));
});
```

- [ ] **Step 2: Frontend download helper**

```typescript
export async function exportSavedContacts(): Promise<Result<void>> {
  try {
    const res = await fetch(`${API_BASE}/v1/pharma-leads/export?saved=true`, { headers });
    if (!res.ok) throw new Error(`${res.status}`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'buyer-contacts.csv';
    a.click();
    return { data: undefined, live: true };
  } catch {
    return { data: undefined, live: false };
  }
}
```

---

## Task 7: LeadDrawer — notes + pitch history

**Files:**
- Modify: `frontend/src/components/LeadDrawer.tsx`
- Modify: `frontend/src/screens/Leads.tsx` (pass `onPatchLead`)

- [ ] **Step 1: Notes textarea (saved leads)**

```tsx
{lead.saved && (
  <section>
    <h4>Notes</h4>
    <textarea
      className="input"
      rows={3}
      value={notesDraft}
      onChange={(e) => setNotesDraft(e.target.value)}
      onBlur={() => onSaveNotes(lead.id, notesDraft)}
      placeholder="MOQ, pricing, follow-up…"
    />
  </section>
)}
```

Debounce or save on blur via `patchLead`.

- [ ] **Step 2: Last pitched line**

```tsx
{lead.lastPitchedAt && (
  <p className="dim">
    Last emailed {new Date(lead.lastPitchedAt).toLocaleDateString()}
    {lead.lastPitchedDrugs?.length ? ` · ${lead.lastPitchedDrugs.join(', ')}` : ''}
  </p>
)}
```

- [ ] **Step 3: Do-not-contact toggle**

Checkbox bound to `doNotContact` → `patchLead`.

- [ ] **Step 4: No change to source pages**

Already implemented in `LeadDrawer.tsx` (contact `sourceUrl`, Google Places badge, `sourceUrls` list). Verify only.

---

## Task 8: Outreach — send integration + templates

**Files:**
- Modify: `frontend/src/screens/Outreach.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Fix `doSend` to pass `leadId` + `drugs`**

```typescript
await sendEmail({
  accountId: account.id,
  leadId: lead.id,
  to: email.value,
  subject,
  body,
  drugs: lead.matchedDrugs,
});
```

On success: callback `onSent?.(lead.id)` so parent can refresh saved list / update local status.

- [ ] **Step 2: Optional `buildContext` aliases only (keep `{{matched_drugs}}` canonical)**

```typescript
// Existing keys unchanged. Optional aliases for template authors:
drugs: lead?.matchedDrugs.join(', ') ?? '',
drug: lead?.matchedDrugs[0] ?? '',
website: lead?.website ?? '',
```

**Do not** add new `DEFAULT_TEMPLATES` with `{single}` braces — existing seeds already use `{{company_name}}`, `{{matched_drugs}}`, `{{agent_name}}`, etc.

Optional: add one manufacturer-oriented template to `DEFAULT_TEMPLATES` using **double braces only**, e.g. subject `Supply enquiry — {{matched_drugs}}`.

- [ ] **Step 3: Wire `App.tsx` refresh after send**

```typescript
function openEmail(lead: PharmaLead) {
  setEmailLeads([lead]);
  setView('outreach');
}
// Optional: pass onSent callback to Outreach to bump status in Leads state
```

Minimal approach: Outreach calls `window` event or optional `onSent` prop from App that triggers `loadSaved()` in Leads via ref — **simplest:** return to Leads after send with message “Marked as contacted” and user hits Refresh, **better:** `onSent` prop chain App → Outreach → patch local state.

Implement `onSent` on `Outreach`:

```typescript
<Outreach leads={emailLeads} onSent={() => setView('leads')} />
```

And in Leads, pass handler that refetches saved + results.

- [ ] **Step 4: Bulk send — per-lead `leadId`, skip `doNotContact`**

Loop sends; collect failures; show summary “Sent 8/10”.

---

## Task 9: Prefer purchase/sales email in table

**Files:**
- Modify: `frontend/src/components/ui.tsx`

- [ ] **Step 1: Update `primaryContact` sort**

```typescript
const labelScore: Record<string, number> = {
  purchase: 4, sales: 3, export: 2, info: 1, support: 1, unknown: 0,
};
return of.sort((a, b) =>
  (labelScore[b.label ?? 'unknown'] - labelScore[a.label ?? 'unknown']) ||
  (b.confidence ?? 0) - (a.confidence ?? 0)
)[0];
```

---

## Task 10: Manual QA checklist

- [ ] Run search with buyer default → summary shows counts
- [ ] Toggle “Has email only” → table filters
- [ ] Save buyer → appears in Contacts; add note → persists after refresh
- [ ] Email buyer (Gmail connected) → status `contacted`; `lastPitchedAt` set
- [ ] Bulk email skips contacted + do-not-contact
- [ ] Export CSV downloads valid file
- [ ] Load more still works; excluded domains include saved + current job

---

## Self-review (plan vs spec)

| Requirement | Task |
|-------------|------|
| U1 Buyer default | Task 6 |
| U2 Summary | Task 6 |
| U3 Filter/sort | Task 5, 6 |
| U4 Save | existing + Task 6 |
| U5 Notes | Task 2, 7 |
| U6 Drug templates | Task 8 |
| U7 Contacted on send | Task 3, 8 |
| U8 Export CSV | Task 6b (server, no 200 cap) |
| Send preflight | Task 3 |
| Reuse templates/drawer | Tasks 7–8 |
| U9 Bulk uncontacted | Task 6, 8 |
| No new pages | File map |
| send-test gap | Task 3 |

No TBD placeholders in implementation steps. Tests omitted per project convention (manual QA Task 10).

---

## Execution handoff

**Plan saved to:** `docs/superpowers/plans/2026-05-29-manufacturer-buyer-leads.md`

**Two execution options:**

1. **Subagent-driven (recommended)** — one task per subagent with review between tasks  
2. **Inline** — implement sequentially in this session with checkpoints after Tasks 3, 6, and 8

Which approach do you want?
