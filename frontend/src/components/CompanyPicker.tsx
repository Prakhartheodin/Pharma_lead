import { useEffect, useState } from 'react';
import type { PharmaLead } from '../lib/types';
import { primaryContact } from './ui';

/**
 * Pick saved companies to compose to. Single pick fills the recipient + template
 * variables from that company; multiple turns compose into per-recipient bulk.
 */
export function CompanyPicker({
  leads, selectedIds, onConfirm, onClose,
}: {
  leads: PharmaLead[];
  selectedIds: string[];
  onConfirm: (picked: PharmaLead[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set(selectedIds));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const filtered = leads.filter((l) =>
    `${l.companyName} ${l.domain ?? ''} ${l.city ?? ''} ${l.state ?? ''}`.toLowerCase().includes(needle)
  );

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Select companies">
        <div className="modal-head">
          <h3 style={{ fontSize: 18 }}>Select companies</h3>
          <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
            From your saved contacts. The template fills with each company's own data
            (<code style={{ fontFamily: 'var(--mono)' }}>{'{{company_name}}'}</code>, city, drugs…).
          </p>
        </div>

        <div className="company-pick-search">
          <input
            className="input"
            autoFocus
            placeholder="Search saved companies…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="button" className="btn btn-ghost" onClick={() => setSel(new Set(leads.map((l) => l.id)))}>
            Select all
          </button>
        </div>

        <div className="modal-body">
          {leads.length === 0 ? (
            <p className="dim" style={{ padding: 20, textAlign: 'center' }}>
              No saved companies yet. Star companies in Search to add them.
            </p>
          ) : filtered.length === 0 ? (
            <p className="dim" style={{ padding: 20, textAlign: 'center' }}>No companies match “{q}”.</p>
          ) : (
            filtered.map((l) => {
              const email = primaryContact(l, 'email')?.value;
              return (
                <label key={l.id} className="company-pick-row">
                  <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="company-pick-name">{l.companyName}</div>
                    <div className="dim mono" style={{ fontSize: 11 }}>
                      {email ?? 'no email'} · {[l.city, l.state].filter(Boolean).join(', ') || '—'}
                    </div>
                  </div>
                  {!email && <span className="chip ghost">no email</span>}
                </label>
              );
            })
          )}
        </div>

        <div className="company-pick-foot">
          <button type="button" className="btn btn-ghost" onClick={() => setSel(new Set())}>Clear</button>
          <span className="dim" style={{ fontSize: 12 }}>{sel.size} selected</span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={sel.size === 0}
            onClick={() => onConfirm(leads.filter((l) => sel.has(l.id)))}
          >
            Use {sel.size} {sel.size === 1 ? 'company' : 'companies'}
          </button>
        </div>
      </div>
    </div>
  );
}
