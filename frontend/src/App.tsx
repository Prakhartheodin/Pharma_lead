import { useState } from 'react';
import type { PharmaLead } from './lib/types';
import { Leads } from './screens/Leads';
import { Outreach } from './screens/Outreach';

type View = 'leads' | 'outreach';

export function App() {
  const [view, setView] = useState<View>('outreach');
  const [emailLeads, setEmailLeads] = useState<PharmaLead[]>([]);

  function openEmail(lead: PharmaLead) {
    setEmailLeads([lead]);
    setView('outreach');
  }
  function openBulkEmail(leads: PharmaLead[]) {
    setEmailLeads(leads);
    setView('outreach');
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">℞</div>
          <div>
            <div className="brand-name">Pharma Leads</div>
            <div className="brand-sub">Discovery + Outreach</div>
          </div>
        </div>

        <nav className="nav">
          <button className={`nav-item ${view === 'leads' ? 'active' : ''}`} onClick={() => setView('leads')}>
            <span className="nav-glyph">⌗</span> Leads
          </button>
          <button className={`nav-item ${view === 'outreach' ? 'active' : ''}`} onClick={() => setView('outreach')}>
            <span className="nav-glyph">✉</span> Inbox
          </button>
        </nav>

        <div className="sidebar-foot">
          <b>Scrapling</b> crawler · <b>Gmail</b> OAuth<br />
          Demo build — auth is a stand-in.
        </div>
      </aside>

      <main className={`main ${view === 'outreach' ? 'main-mail' : ''}`}>
        {view === 'leads'
          ? <Leads onEmail={openEmail} onBulkEmail={openBulkEmail} />
          : <Outreach leads={emailLeads} onClearLeads={() => setEmailLeads([])} />}
      </main>
    </div>
  );
}
