import type { Contact, LeadStatus, PharmaLead } from '../lib/types';

export function StatusPill({ status }: { status: LeadStatus }) {
  return <span className={`pill ${status}`}>{status}</span>;
}

export function Confidence({ value }: { value: number }) {
  const color = value >= 75 ? 'var(--good)' : value >= 45 ? 'var(--warn)' : 'var(--bad)';
  return (
    <div className="conf" title={`${value}% confidence`}>
      <div className="conf-bar">
        <div className="conf-fill" style={{ width: `${Math.max(4, value)}%`, background: color }} />
      </div>
      <span className="conf-val">{value}</span>
    </div>
  );
}

export function DrugChips({ drugs }: { drugs: string[] }) {
  if (!drugs.length) return <span className="chip ghost">no match</span>;
  return (
    <div className="chips">
      {drugs.map((d) => <span key={d} className="chip">{d}</span>)}
    </div>
  );
}

export function primaryContact(lead: PharmaLead, type: 'email' | 'phone'): Contact | undefined {
  const of = lead.contacts.filter((c) => c.type === type);
  // prefer role emails (sales/export/purchase) by confidence
  return of.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
}

export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}
