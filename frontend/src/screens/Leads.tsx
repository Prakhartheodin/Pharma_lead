import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { PharmaLead } from '../lib/types';
import { listLeads, startSearch, loadMoreSearch, saveLead, getJobStatus } from '../lib/api';
import { Confidence, DrugChips, StatusPill, primaryContact } from '../components/ui';
import { LeadDrawer } from '../components/LeadDrawer';
import { DrugSelect } from '../components/DrugSelect';

async function getUserLocation(): Promise<{ lat: number; lng: number } | undefined> {
  if (!('geolocation' in navigator)) return undefined;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(undefined),
      { timeout: 8000, maximumAge: 600000 }
    );
  });
}

function searchErrorMessage(error?: string): string {
  if (error && /429|quota|RESOURCE_EXHAUSTED/i.test(error)) {
    return 'Google Places daily search quota reached. Raise it in Google Cloud Console (Places API → Quotas), or try again after it resets (~midnight US Pacific).';
  }
  return error ? `Search failed: ${error}` : 'Search failed — please try again.';
}

type Tab = 'search' | 'contacts';

// Sell-side platform: the user manufactures these APIs, so buyers/users come first.
const COMPANY_TYPES = [
  { value: 'buyer', label: 'Buyer / Formulator / Importer' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'exporter', label: 'Exporter' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'manufacturer', label: 'Manufacturer (API)' },
  { value: 'any', label: 'Any type' },
];

export function Leads({
  onEmail, onBulkEmail,
}: { onEmail: (l: PharmaLead) => void; onBulkEmail: (ls: PharmaLead[]) => void }) {
  const [tab, setTab] = useState<Tab>('search');
  // Search-tab results: ONLY the current search's job (never the saved ledger).
  const [results, setResults] = useState<PharmaLead[]>([]);
  const [savedLeads, setSavedLeads] = useState<PharmaLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(true);
  const [active, setActive] = useState<PharmaLead | null>(null);
  const [searching, setSearching] = useState(false);
  const [phase, setPhase] = useState<string>('');
  const [progress, setProgress] = useState<{ discovered: number; crawled: number } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollRef = useRef<{ cancel: boolean }>({ cancel: false });
  const lastCoordsRef = useRef<{ lat: number; lng: number } | undefined>(undefined);

  const [drugs, setDrugs] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [businessType, setBusinessType] = useState('buyer');

  async function loadSaved() {
    const r = await listLeads({ saved: true });
    setSavedLeads(r.data); setLive(r.live);
  }
  async function loadResults(jobId: string | null, silent = false) {
    if (!jobId) { setResults([]); return; }
    if (!silent) setLoading(true);
    const r = await listLeads({ jobId });
    setResults(r.data); setLive(r.live);
    if (!silent) setLoading(false);
  }
  useEffect(() => { void loadSaved(); return () => { pollRef.current.cancel = true; }; }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function pollJob(jid: string, token: { cancel: boolean }, phaseLabel: string) {
    for (let i = 0; i < 60 && !token.cancel; i++) {
      await sleep(2000);
      if (token.cancel) return;
      const js = await getJobStatus(jid);
      const p = js.data.progress ?? {};
      setProgress({ discovered: p.discoveredUrls ?? 0, crawled: p.crawledDomains ?? 0 });
      setPhase((p.discoveredUrls ?? 0) === 0
        ? phaseLabel
        : `Crawling sites for contacts — ${p.crawledDomains ?? 0}/${p.discoveredUrls} done`);
      await loadResults(jid, true);
      if (js.data.status && js.data.status !== 'running') break;
    }
  }

  async function runSearch() {
    pollRef.current.cancel = true;          // cancel any in-flight poll
    const token = { cancel: false };
    pollRef.current = token;

    setSearching(true);
    setProgress(null);
    setResults([]);
    setNote(null);
    setErrorMsg(null);
    setPhase('Finding companies…');
    setTab('search');

    let coords: { lat: number; lng: number } | undefined;
    if (!city && !state) {
      setPhase('Getting your location…');
      coords = await getUserLocation();
      lastCoordsRef.current = coords;
      setNote(coords
        ? 'Using your location — widening the radius by 200 km (up to all of India) until 5+ new companies are found.'
        : 'Location unavailable — searching India-wide. Allow location or set a city/state to narrow it.');
    } else {
      lastCoordsRef.current = undefined;
    }
    if (token.cancel) return;

    setPhase('Discovering pharma companies…');
    const r = await startSearch({
      drugs,
      city: city || undefined, state: state || undefined,
      businessType,
      lat: coords?.lat, lng: coords?.lng,
    });
    const jid = r.data.jobId ?? null;
    if (token.cancel) return;
    if (!r.live) { setSearching(false); setPhase(''); setErrorMsg('Backend unreachable — start the API and try again.'); return; }
    if (!jid || r.data.status === 'failed') {
      setSearching(false); setPhase('');
      setErrorMsg(searchErrorMessage(r.data.error));
      return;
    }
    setActiveJobId(jid);

    await pollJob(jid, token, 'Discovering pharma companies…');
    if (token.cancel) return;
    setSearching(false);
    setPhase('');
    void loadResults(jid);
    void loadSaved();
  }

  async function runLoadMore() {
    if (!activeJobId || drugs.length === 0) return;
    pollRef.current.cancel = true;
    const token = { cancel: false };
    pollRef.current = token;

    setSearching(true);
    setNote(null);
    setErrorMsg(null);
    setPhase('Finding 5 more companies…');

    const coords = lastCoordsRef.current;
    const r = await loadMoreSearch({
      jobId: activeJobId,
      drugs,
      city: city || undefined,
      state: state || undefined,
      businessType,
      lat: coords?.lat,
      lng: coords?.lng,
    });
    if (token.cancel) return;
    if (!r.live) { setSearching(false); setPhase(''); setErrorMsg('Backend unreachable — start the API and try again.'); return; }
    if (r.data.status === 'failed') {
      setSearching(false); setPhase('');
      setErrorMsg(searchErrorMessage(r.data.error));
      return;
    }
    if ((r.data.discovered ?? 0) === 0) {
      setNote('No more new companies found — try another drug, city, or company type.');
      setSearching(false);
      setPhase('');
      return;
    }

    await pollJob(activeJobId, token, 'Finding 5 more companies…');
    if (token.cancel) return;
    setSearching(false);
    setPhase('');
    void loadResults(activeJobId);
    void loadSaved();
  }

  async function doSave(lead: PharmaLead) {
    const next = !lead.saved;
    setResults((ls) => ls.map((l) => (l.id === lead.id ? { ...l, saved: next } : l)));
    setActive((a) => (a && a.id === lead.id ? { ...a, saved: next } : a));
    setSavedLeads((sl) => next
      ? (sl.some((x) => x.id === lead.id) ? sl : [...sl, { ...lead, saved: true }])
      : sl.filter((x) => x.id !== lead.id));
    await saveLead(lead.id, next);
  }
  function toggleSave(e: MouseEvent, lead: PharmaLead) {
    e.stopPropagation();
    void doSave(lead);
  }

  // Search shows only unsaved finds — saving a row moves it to Contacts.
  const searchRows = results.filter((l) => !l.saved);
  const rows = tab === 'search' ? searchRows : savedLeads;
  const withEmail = savedLeads.filter((l) => l.contacts.some((c) => c.type === 'email'));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Discovery</div>
          <h1 className="page-title">Pharma <em>leads</em></h1>
          <p className="page-desc">Discover companies by drug, then reach out. Search finds new companies; Contacts is your saved book.</p>
        </div>
      </div>

      {/* Top-level toggle: Search (discovery) vs Contacts (saved book) */}
      <div className="seg seg-top" role="tablist" aria-label="View">
        <button className={`seg-btn ${tab === 'search' ? 'on' : ''}`} onClick={() => setTab('search')}>
          ⌕ Search
        </button>
        <button className={`seg-btn ${tab === 'contacts' ? 'on' : ''}`} onClick={() => setTab('contacts')}>
          ★ Contacts <span className="seg-n">{savedLeads.length}</span>
        </button>
      </div>

      {!live && (
        <div className="banner">⚠ Backend unreachable — start the API (docker compose up) to load leads.</div>
      )}

      {tab === 'search' && (
        <>
          <div className="filterbar">
            <div className="field" style={{ flex: '2 1 240px' }}>
              <label>Drugs</label>
              <DrugSelect value={drugs} onChange={setDrugs} />
            </div>
            <div className="field" style={{ flex: '1 1 160px' }}>
              <label>Company type</label>
              <select className="input" value={businessType} onChange={(e) => setBusinessType(e.target.value)}>
                {COMPANY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: '1 1 130px' }}>
              <label>City</label>
              <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Mumbai" />
            </div>
            <div className="field" style={{ flex: '1 1 140px' }}>
              <label>State</label>
              <input className="input" value={state} onChange={(e) => setState(e.target.value)} placeholder="Maharashtra" />
            </div>
            <button className="btn btn-primary" onClick={runSearch} disabled={searching || drugs.length === 0}>
              {searching ? <><span className="spinner" /> Searching…</> : '⌕ Run search'}
            </button>
            {activeJobId && (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={() => void runLoadMore()}
                  disabled={searching || drugs.length === 0}
                  title="Discover 5 more companies (skips ones already in this search and saved contacts)"
                >
                  {searching ? <><span className="spinner" /> Loading…</> : '+ Load more (5)'}
                </button>
                <button className="btn btn-ghost" onClick={() => loadResults(activeJobId)}>↻ Refresh</button>
              </>
            )}
          </div>
          {note && <div className="note">{note}</div>}
          {errorMsg && <div className="note note-error">⚠ {errorMsg}</div>}
        </>
      )}

      <div className="table-wrap">
        <div className="table-meta">
          {tab === 'search' ? (
            <span className="count"><b>{searchRows.length}</b> found — star to save</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="count"><b>{savedLeads.length}</b> saved contacts</span>
              <button className="btn btn-primary btn-sm" disabled={withEmail.length === 0}
                onClick={() => onBulkEmail(withEmail)}>
                ✉ Draft outreach ({withEmail.length})
              </button>
            </div>
          )}
          <span className="count dim">{live ? 'live' : 'sample'} data</span>
        </div>

        {tab === 'search' && searching && rows.length > 0 && (
          <div className="crawl-strip">
            <span className="spinner spinner-teal" />
            <span>{phase}</span>
            {progress && progress.discovered > 0 && (
              <span className="crawl-bar" aria-hidden>
                <span className="crawl-bar-fill" style={{ width: `${Math.round((progress.crawled / Math.max(progress.discovered, 1)) * 100)}%` }} />
              </span>
            )}
          </div>
        )}

        {tab === 'search' && searching && rows.length === 0 ? (
          <div className="search-loading" role="status" aria-live="polite">
            <div className="radar"><span className="radar-dot" /></div>
            <h3 className="sl-title">{phase || 'Searching…'}</h3>
            {progress && progress.discovered > 0 ? (
              <>
                <div className="sl-prog">
                  <div className="sl-prog-fill" style={{ width: `${Math.round((progress.crawled / Math.max(progress.discovered, 1)) * 100)}%` }} />
                </div>
                <p className="sl-sub">{progress.crawled} of {progress.discovered} companies crawled</p>
              </>
            ) : (
              <p className="sl-sub">This can take a moment — discovery then crawling each site for contacts.</p>
            )}
            <div className="sl-skeletons">{[0, 1, 2].map((i) => <div className="skeleton-row" key={i} />)}</div>
          </div>
        ) : loading ? (
          <div>{[0, 1, 2, 3, 4].map((i) => <div className="skeleton-row" key={i} />)}</div>
        ) : rows.length === 0 ? (
          <div className="state">
            <div className="glyph">{tab === 'contacts' ? '★' : '⌕'}</div>
            <h3>{tab === 'contacts' ? 'No saved contacts yet' : (activeJobId ? 'No companies found' : 'Run a search')}</h3>
            <p>{tab === 'contacts'
              ? 'Companies you discover are saved here automatically.'
              : (activeJobId
                ? 'Try another drug, city, or allow location to widen the radius.'
                : 'Pick a drug above and run a search to discover pharma companies.')}</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="c-save"></th>
                <th>Company</th><th>Location</th><th>Matched drugs</th><th>Type</th>
                <th>Primary email</th><th>Phone</th><th>Contacts</th><th>Confidence</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l, i) => {
                const email = primaryContact(l, 'email');
                const phone = primaryContact(l, 'phone');
                return (
                  <tr key={l.id} onClick={() => setActive(l)}
                    className={`row-in ${l.saved ? 'is-saved' : ''}`}
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <td className="c-save">
                      <button
                        className={`star ${l.saved ? 'on' : ''}`}
                        onClick={(e) => toggleSave(e, l)}
                        title={l.saved ? 'Saved — click to remove' : 'Save lead'}
                        aria-label={l.saved ? 'Remove from saved' : 'Save lead'}
                      >
                        {l.saved ? '★' : '☆'}
                      </button>
                    </td>
                    <td className="c-company">{l.companyName}<span className="web">{l.domain}</span></td>
                    <td>{[l.city, l.state].filter(Boolean).join(', ') || <span className="dim">—</span>}</td>
                    <td><DrugChips drugs={l.matchedDrugs} /></td>
                    <td><span className="btype">{l.businessType}</span></td>
                    <td className="mono">{email ? email.value : <span className="dim">—</span>}</td>
                    <td className="mono">{phone ? phone.value : <span className="dim">—</span>}</td>
                    <td className="mono dim">{l.contacts.length}</td>
                    <td><Confidence value={l.confidence} /></td>
                    <td><StatusPill status={l.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {active && <LeadDrawer lead={active} onClose={() => setActive(null)} onEmail={(l) => { setActive(null); onEmail(l); }} onToggleSave={() => doSave(active)} />}
    </div>
  );
}
