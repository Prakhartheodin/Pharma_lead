import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EmailAccount, PharmaLead, Template } from '../lib/types';
import { listAccounts, listTemplates, sendEmail, getGmailConnectUrl, listLeads } from '../lib/api';
import { primaryContact, initials } from '../components/ui';
import { TemplatePicker } from '../components/TemplatePicker';
import { CompanyPicker } from '../components/CompanyPicker';
import { Mailbox } from './Mailbox';
import { PersonalTemplates } from './PersonalTemplates';
import { EmailDraftModal } from '../components/EmailDraftModal';

type OutreachTab = 'compose' | 'inbox' | 'templates';

const AGENT_NAME = 'Outreach Team';

function buildContext(lead: PharmaLead | null): Record<string, string> {
  const email = lead ? primaryContact(lead, 'email')?.value ?? '' : '';
  const phone = lead ? primaryContact(lead, 'phone')?.value ?? '' : '';
  return {
    company_name: lead?.companyName ?? '',
    matched_drugs: lead?.matchedDrugs.join(', ') ?? '',
    city: lead?.city ?? '',
    state: lead?.state ?? '',
    recipient_email: email,
    recipient_name: lead?.companyName ?? 'there',
    primary_phone: phone,
    agent_name: AGENT_NAME,
    date: new Date().toLocaleDateString(),
  };
}

function interpolate(text: string, ctx: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, k) => ctx[k] ?? `{{${k}}}`);
}

export function Outreach({
  leads,
  onClearLeads,
}: {
  leads: PharmaLead[];
  onClearLeads?: () => void;
}) {
  const [tab, setTab] = useState<OutreachTab>(leads.length > 0 ? 'compose' : 'inbox');
  const [aiDraftOpen, setAiDraftOpen] = useState(false);

  // Companies being composed to — seeded from the Contacts bulk action, but also
  // pickable right here via the company picker.
  const [selectedLeads, setSelectedLeads] = useState<PharmaLead[]>(leads);
  const [savedLeads, setSavedLeads] = useState<PharmaLead[]>([]);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [appliedTemplate, setAppliedTemplate] = useState<Template | null>(null);

  const lead = selectedLeads[0] ?? null;
  const bulk = selectedLeads.length > 1;
  const recipients = useMemo(
    () => selectedLeads.filter((l) => primaryContact(l, 'email')?.value),
    [selectedLeads]
  );

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [accountId, setAccountId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Single source of truth for the connected Gmail account(s). Re-fetched after
  // connect/sign-out so Compose & Templates stay in lock-step with the mailbox.
  const refreshAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    const r = await listAccounts();
    setAccounts(r.data);
    setAccountId((prev) => (r.data.some((a) => a.id === prev) ? prev : r.data[0]?.id ?? ''));
    setLoadingAccounts(false);
  }, []);

  useEffect(() => {
    void refreshAccounts();
    listTemplates().then((r) => setTemplates(r.data));
  }, [refreshAccounts]);

  // Saved companies to pick from in compose.
  useEffect(() => {
    listLeads({ saved: true }).then((r) => setSavedLeads(r.data));
  }, []);

  // When arriving from the Contacts bulk action, adopt that selection.
  useEffect(() => {
    if (leads.length > 0) { setSelectedLeads(leads); setTab('compose'); }
  }, [leads]);

  // Keep the composed subject/body in sync with the selected company's data:
  // single company → fill the variables for that company; multiple → keep raw
  // {{vars}} (filled per recipient at send time).
  useEffect(() => {
    if (!appliedTemplate) return;
    if (bulk) {
      setSubject(appliedTemplate.subject);
      setBody(appliedTemplate.bodyHtml);
    } else {
      const c = buildContext(lead);
      setSubject(interpolate(appliedTemplate.subject, c));
      setBody(interpolate(appliedTemplate.bodyHtml, c));
    }
  }, [appliedTemplate, lead, bulk]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('gmail_connected');
    if (!connected) return;
    setToast(`Connected ${decodeURIComponent(connected)}`);
    setTab('inbox');
    void refreshAccounts();
    params.delete('gmail_connected');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, []);

  // Prefill recipient when arriving from a single lead.
  useEffect(() => {
    if (!bulk && lead) setTo(primaryContact(lead, 'email')?.value ?? '');
  }, [lead, bulk]);

  function applyTemplate(t: Template) {
    // Stored, then the sync effect fills variables for the selected company
    // (single) or leaves raw {{vars}} for per-recipient fill (bulk).
    setAppliedTemplate(t);
    setPickerOpen(false);
    setToast(`Inserted "${t.name}"`);
  }

  async function doSend(test: boolean) {
    if (!to || !subject) { setToast('Add a recipient and subject first'); return; }
    setSending(true);
    const r = await sendEmail({
      accountId,
      to,
      subject,
      body,
      leadId: bulk ? undefined : lead?.id,
      drugs: lead?.matchedDrugs,
    });
    setSending(false);
    setToast(r.live
      ? (test ? 'Test email sent' : 'Email sent')
      : (r.data.ok === false ? 'Send failed — connect a Gmail account first' : 'Backend unreachable'));
  }

  async function doSendBulk() {
    if (!subject) { setToast('Pick a template or write a subject first'); return; }
    setSending(true);
    let sent = 0;
    for (let i = 0; i < recipients.length; i++) {
      const l = recipients[i];
      setProgress({ done: i, total: recipients.length });
      const c = buildContext(l);
      const r = await sendEmail({
        accountId,
        to: primaryContact(l, 'email')!.value,
        subject: interpolate(subject, c),
        body: interpolate(body, c),
        leadId: l.id,
        drugs: l.matchedDrugs,
      });
      if (r.data?.ok ?? true) sent += 1;
    }
    setProgress(null);
    setSending(false);
    setToast(`Drafted/sent ${sent} of ${recipients.length} saved contacts`);
  }

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const noAccount = accounts.length === 0;

  const tabBar = (
    <div className="outreach-tabs">
      <button type="button" className={`btn ${tab === 'inbox' ? 'btn-primary' : ''}`} onClick={() => setTab('inbox')}>Inbox</button>
      <button type="button" className={`btn ${tab === 'compose' ? 'btn-primary' : ''}`} onClick={() => setTab('compose')}>Compose</button>
      <button type="button" className={`btn ${tab === 'templates' ? 'btn-primary' : ''}`} onClick={() => setTab('templates')}>My templates</button>
    </div>
  );

  // Everything in Outreach is gated behind a connected Gmail account.
  if (loadingAccounts) {
    return (
      <div className="page">
        <p className="dim" style={{ padding: 48, textAlign: 'center' }}>Checking Gmail connection…</p>
      </div>
    );
  }
  if (noAccount) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">Outreach</div>
            <h1 className="page-title">Connect <em>Gmail</em></h1>
            <p className="page-desc">Inbox, compose, AI drafts, and templates all run through your connected mailbox. Sign in with Gmail to unlock them.</p>
          </div>
        </div>
        <div className="aside-card" style={{ maxWidth: 460 }}>
          <h4>Connect your Gmail</h4>
          <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
            Uses Gmail OAuth (read + send). Nothing here is available until a mailbox is connected, and signing out removes it.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => { window.location.href = getGmailConnectUrl(); }}
          >
            Connect Gmail
          </button>
        </div>
        {toast && <div className="toast"><span className="dot" />{toast}</div>}
      </div>
    );
  }

  if (tab === 'inbox') {
    return (
      <Mailbox
        tabBar={tabBar}
        onCompose={() => setTab('compose')}
        onTemplates={() => setTab('templates')}
        onAccountsChanged={refreshAccounts}
      />
    );
  }
  if (tab === 'templates') return <PersonalTemplates tabBar={tabBar} />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Outreach</div>
          <h1 className="page-title">Lead <em>compose</em></h1>
          <p className="page-desc">Compose from a connected Gmail account. Drop in a job template and its variables fill from the lead.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          {tabBar}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" onClick={() => setCompanyPickerOpen(true)}>
              👥 {selectedLeads.length > 0 ? `${selectedLeads.length} compan${selectedLeads.length === 1 ? 'y' : 'ies'}` : 'Select companies'}
            </button>
            {selectedLeads.length > 0 && (
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }}
                onClick={() => { setSelectedLeads([]); onClearLeads?.(); }}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="compose-grid">
        <div className="compose-card">
          <div className="compose-head">
            <h3>New message</h3>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ maxWidth: 240 }}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
              {noAccount && <option>No Gmail connected</option>}
            </select>
          </div>

          <div className="compose-row">
            <label>To</label>
            {bulk ? (
              <span className="dim" style={{ fontSize: 13 }}>
                <b style={{ color: 'var(--ink)' }}>{recipients.length}</b> companies with an email
                {selectedLeads.length > recipients.length && ` · ${selectedLeads.length - recipients.length} skipped (no email)`}
              </span>
            ) : (
              <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="sales@company.co.in" />
            )}
          </div>
          <div className="compose-row">
            <label>Subject</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Sourcing enquiry…" />
          </div>

          <textarea className="compose-body" value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message, or insert a job template →" />

          <div className="compose-foot">
            <button type="button" className="btn" onClick={() => setAiDraftOpen(true)}>✦ AI draft</button>
            <button className="btn template-btn" onClick={() => setPickerOpen(true)}>❏ Job template</button>
            <span className="dim" style={{ fontSize: 12 }}>
              {bulk
                ? (progress ? `Sending ${progress.done + 1}/${progress.total}…` : `${recipients.length} recipients · variables fill per company`)
                : (lead ? `for ${lead.companyName}` : 'no company selected — pick one above')}
            </span>
            <span className="spacer" />
            {bulk ? (
              <button className="btn btn-primary" onClick={doSendBulk} disabled={sending || noAccount || recipients.length === 0}>
                {sending ? '◌ Sending…' : `➤ Send to all ${recipients.length}`}
              </button>
            ) : (
              <>
                <button className="btn" onClick={() => doSend(true)} disabled={sending || noAccount}>Send test</button>
                <button className="btn btn-primary" onClick={() => doSend(false)} disabled={sending || noAccount}>
                  {sending ? '◌ Sending…' : '➤ Send'}
                </button>
              </>
            )}
          </div>
        </div>

        <div>
          {noAccount ? (
            <div className="aside-card">
              <h4>Connect Gmail</h4>
              <p className="dim" style={{ fontSize: 13, marginBottom: 12 }}>No mailbox connected. Sending uses your own Gmail via OAuth.</p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  window.location.href = getGmailConnectUrl();
                }}
              >
                Connect a Gmail account
              </button>
            </div>
          ) : (
            <div className="aside-card">
              <h4>Sending as</h4>
              {accounts.map((a) => (
                <div className="recip" key={a.id}>
                  <div className="avatar">{a.email[0]?.toUpperCase()}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 12.5 }}>{a.email}</div>
                    <div className="dim" style={{ fontSize: 11 }}>Gmail · {a.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {bulk ? (
            <div className="aside-card">
              <h4>Recipients ({recipients.length})</h4>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {recipients.map((l) => (
                  <div className="recip" key={l.id}>
                    <div className="avatar">{initials(l.companyName)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.companyName}</div>
                      <div className="mono dim" style={{ fontSize: 11 }}>{primaryContact(l, 'email')?.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : lead && (
            <div className="aside-card">
              <h4>Recipient lead</h4>
              <div className="recip">
                <div className="avatar">{initials(lead.companyName)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{lead.companyName}</div>
                  <div className="dim" style={{ fontSize: 11.5 }}>{[lead.city, lead.state].filter(Boolean).join(', ')}</div>
                </div>
              </div>
              <div className="chips" style={{ marginTop: 10 }}>
                {lead.matchedDrugs.map((d) => <span key={d} className="chip">{d}</span>)}
              </div>
            </div>
          )}

          <div className="aside-card">
            <h4>Template variables</h4>
            <div className="var-hint">
              <code>{'{{company_name}}'}</code> <code>{'{{matched_drugs}}'}</code> <code>{'{{city}}'}</code>{' '}
              <code>{'{{state}}'}</code> <code>{'{{recipient_email}}'}</code> <code>{'{{agent_name}}'}</code> <code>{'{{date}}'}</code>
            </div>
          </div>
        </div>
      </div>

      {companyPickerOpen && (
        <CompanyPicker
          leads={savedLeads}
          selectedIds={selectedLeads.map((l) => l.id)}
          onConfirm={(picked) => { setSelectedLeads(picked); setCompanyPickerOpen(false); }}
          onClose={() => setCompanyPickerOpen(false)}
        />
      )}
      {pickerOpen && <TemplatePicker templates={templates} onPick={applyTemplate} onClose={() => setPickerOpen(false)} />}
      {aiDraftOpen && (
        <EmailDraftModal
          subject={subject}
          context={body.slice(0, 500)}
          recipientName={lead?.companyName}
          onPick={(html, sub) => {
            setBody(html);
            if (sub) setSubject(sub);
          }}
          onClose={() => setAiDraftOpen(false)}
        />
      )}
      {toast && <div className="toast"><span className="dot" />{toast}</div>}
    </div>
  );
}
