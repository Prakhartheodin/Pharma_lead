import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Contact, PharmaLead } from '../lib/types';
import { DrugChips, StatusPill, Confidence } from './ui';

const CONTACT_ICON: Record<Contact['type'], string> = {
  email: '✉', phone: '☎', whatsapp: '◍',
};

// host + path, e.g. "furbopharma.com/contact.html" — the page a contact came from.
function prettyUrl(u: string): string {
  try {
    const url = new URL(u);
    return `${url.host.replace(/^www\./, '')}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return u;
  }
}

export function LeadDrawer({
  lead, onClose, onEmail, onToggleSave,
}: { lead: PharmaLead; onClose: () => void; onEmail: (l: PharmaLead) => void; onToggleSave: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`${lead.companyName} detail`}>
        <button className="drawer-x" onClick={onClose} aria-label="Close">✕</button>
        <div className="drawer-head">
          <StatusPill status={lead.status} />
          <h2 style={{ fontSize: 24, margin: '12px 0 4px' }}>{lead.companyName}</h2>
          <a className="mono dim" href={lead.website} target="_blank" rel="noreferrer">{lead.domain}</a>
          <button
            className={`btn btn-ghost save-toggle ${lead.saved ? 'on' : ''}`}
            onClick={onToggleSave}
            style={{ position: 'absolute', top: 16, right: 56 }}
          >
            {lead.saved ? '★ Saved' : '☆ Save'}
          </button>
        </div>

        <div className="drawer-body">
          <div className="section-label">Overview</div>
          <dl className="kv">
            <dt>Location</dt><dd>{[lead.city, lead.state].filter(Boolean).join(', ') || '—'}, {lead.country ?? 'India'}</dd>
            <dt>Business</dt><dd style={{ textTransform: 'capitalize' }}>{lead.businessType}</dd>
            <dt>Matched</dt><dd><DrugChips drugs={lead.matchedDrugs} /></dd>
            <dt>Confidence</dt><dd><Confidence value={lead.confidence} /></dd>
            <dt>Crawled</dt><dd className="mono dim">{lead.lastCrawledAt ? new Date(lead.lastCrawledAt).toLocaleString() : '—'}</dd>
          </dl>

          <div className="section-label">Contacts ({lead.contacts.length})</div>
          {lead.contacts.length === 0 && <p className="dim" style={{ fontSize: 13 }}>No public contacts were extracted from this site.</p>}
          {lead.contacts.map((c, i) => (
            <div className="contact-row" key={i}>
              <div className={`contact-ic ${c.type}`}>{CONTACT_ICON[c.type]}</div>
              <div style={{ minWidth: 0 }}>
                <div className="contact-val">{c.value}</div>
                <div className="contact-meta">
                  {c.type}{c.label && c.label !== 'unknown' ? ` · ${c.label}` : ''}
                </div>
                {c.source === 'google_places' ? (
                  <div className="contact-src places">⌖ from Google Places</div>
                ) : c.sourceUrl ? (
                  <a className="contact-src" href={c.sourceUrl} target="_blank" rel="noreferrer" title={c.sourceUrl}>
                    ↗ {prettyUrl(c.sourceUrl)}
                  </a>
                ) : null}
              </div>
              {typeof c.confidence === 'number' && <span className="chip ghost lbl">{c.confidence}</span>}
            </div>
          ))}

          <div className="section-label">Source pages</div>
          {lead.sourceUrls.map((u) => (
            <div key={u} className="mono" style={{ fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <a href={u} target="_blank" rel="noreferrer">{u}</a>
            </div>
          ))}

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 24, justifyContent: 'center' }}
            onClick={() => onEmail(lead)} disabled={!lead.contacts.some((c) => c.type === 'email')}>
            ✉ Draft outreach email
          </button>
          {!lead.contacts.some((c) => c.type === 'email') &&
            <p className="dim" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>No email to send to.</p>}
        </div>
      </aside>
    </>,
    document.body
  );
}
