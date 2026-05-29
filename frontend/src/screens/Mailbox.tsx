import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import type { EmailAccount, EmailMessage, EmailThreadListItem, EmailLabel } from '../lib/types';
import { listAccounts, disconnectAccount, getGmailConnectUrl } from '../lib/api';
import {
  getLabels,
  getThread,
  getThreads,
  replyMessage,
  replyAllMessage,
  forwardMessage,
  trashThreads,
  batchModifyThreads,
  fetchAttachmentBlob,
} from '../lib/emailApi';
import { EmailDraftModal } from '../components/EmailDraftModal';
import { MailComposeModal } from '../components/MailComposeModal';

type ComposeMode = null | 'reply' | 'reply-all' | 'forward';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function parseFrom(from: string): string {
  const m = from.match(/^([^<]+)</);
  return (m ? m[1] : from).replace(/"/g, '').trim() || from;
}

function senderInitial(from: string): string {
  const name = parseFrom(from);
  const ch = name.replace(/[^a-zA-Z0-9]/g, '').charAt(0);
  return (ch || '?').toUpperCase();
}

function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function isStarred(thread: EmailThreadListItem): boolean {
  return thread.labelIds?.includes('STARRED') ?? false;
}

const FOLDER_ORDER = ['INBOX', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'IMPORTANT'];
const GMAIL_SETTINGS_URL = 'https://mail.google.com/mail/u/0/#settings/general';

export function Mailbox({
  tabBar,
  onCompose,
  onTemplates,
  onAccountsChanged,
}: {
  tabBar?: ReactNode;
  onCompose?: () => void;
  onTemplates?: () => void;
  onAccountsChanged?: () => void;
}) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountId, setAccountId] = useState('');
  const [labels, setLabels] = useState<EmailLabel[]>([]);
  const [labelId, setLabelId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [threads, setThreads] = useState<EmailThreadListItem[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [activeMsg, setActiveMsg] = useState<EmailMessage | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [composeMode, setComposeMode] = useState<ComposeMode>(null);
  const [composeHtml, setComposeHtml] = useState('');
  const [forwardTo, setForwardTo] = useState('');
  const [sending, setSending] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [newMsgOpen, setNewMsgOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const activeAccount = accounts.find((a) => a.id === accountId);
  const noAccount = !loadingAccounts && accounts.length === 0;

  const systemLabels = useMemo(() => {
    const sorted = [...labels].sort((a, b) => {
      const ai = FOLDER_ORDER.indexOf(a.id);
      const bi = FOLDER_ORDER.indexOf(b.id);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [labels]);

  const inboxUnread = labels.find((l) => l.id === 'INBOX')?.messagesUnread;

  const loadThreads = useCallback(async (token?: string) => {
    if (!accountId) {
      setLoadingThreads(false);
      return;
    }
    setLoadingThreads(true);
    const r = await getThreads({
      accountId,
      labelId: labelId || undefined,
      pageToken: token,
      pageSize: 25,
      q: searchQ || undefined,
    });
    setLoadingThreads(false);
    if (!r.live || !r.data?.threads) {
      setToast('Could not load mail — sign out mailbox, then connect Gmail again');
      return;
    }
    setThreads((prev) => (token ? [...prev, ...r.data.threads] : r.data.threads));
    setNextToken(r.data.nextPageToken);
  }, [accountId, labelId, searchQ]);

  useEffect(() => {
    setLoadingAccounts(true);
    listAccounts().then((r) => {
      setAccounts(r.data);
      setAccountId(r.data[0]?.id ?? '');
      setLoadingAccounts(false);
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('gmail_connected');
    if (!connected) return;
    setToast(`Connected ${decodeURIComponent(connected)}`);
    listAccounts().then((r) => {
      setAccounts(r.data);
      setAccountId(r.data[0]?.id ?? '');
    });
    params.delete('gmail_connected');
    const qs = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, []);

  useEffect(() => {
    if (!accountId) return;
    getLabels(accountId).then((r) => {
      if (r.live) setLabels(r.data);
    });
  }, [accountId]);

  useEffect(() => {
    setThreads([]);
    setSelectedId(null);
    setSelectedIds(new Set());
    setMessages([]);
    setActiveMsg(null);
    if (accountId) loadThreads();
  }, [accountId, labelId, loadThreads]);

  async function signOutMailbox() {
    if (!accountId || signingOut) return;
    if (!window.confirm('Sign out this Gmail mailbox? You can connect again anytime.')) return;
    setSigningOut(true);
    const r = await disconnectAccount(accountId);
    setSigningOut(false);
    if (!r.live || !r.data.success) {
      setToast('Could not sign out mailbox');
      return;
    }
    setToast('Mailbox signed out');
    const acc = await listAccounts();
    setAccounts(acc.data);
    const next = acc.data[0]?.id ?? '';
    setAccountId(next);
    setThreads([]);
    setSelectedId(null);
    setMessages([]);
    setActiveMsg(null);
    // Tell Outreach so Compose/Templates re-gate behind login immediately.
    onAccountsChanged?.();
  }

  function toggleSelect(threadId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === threads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(threads.map((t) => t.threadId)));
    }
  }

  async function markThreadsRead(threadIds: string[]) {
    if (!threadIds.length) return;
    const r = await batchModifyThreads(accountId, threadIds, { removeLabelIds: ['UNREAD'] });
    if (r.live) {
      setToast(`Marked ${threadIds.length} as read`);
      loadThreads();
    } else setToast('Mark read failed');
  }

  async function toggleStar(thread: EmailThreadListItem, e: MouseEvent) {
    e.stopPropagation();
    const starred = isStarred(thread);
    const r = await batchModifyThreads(accountId, [thread.threadId], starred
      ? { removeLabelIds: ['STARRED'] }
      : { addLabelIds: ['STARRED'] });
    if (r.live) loadThreads();
    else setToast('Could not update star');
  }

  async function trashSelectedBulk() {
    const ids = selectedIds.size > 0 ? [...selectedIds] : selectedId ? [selectedId] : [];
    if (!ids.length) return;
    const r = await trashThreads(accountId, ids);
    setToast(r.live ? 'Moved to trash' : 'Trash failed');
    setSelectedIds(new Set());
    setSelectedId(null);
    setMessages([]);
    setActiveMsg(null);
    loadThreads();
  }

  async function openThread(thread: EmailThreadListItem) {
    setSelectedId(thread.threadId);
    setComposeMode(null);
    const r = await getThread(accountId, thread.threadId);
    if (!r.live || !r.data.messages?.length) {
      setToast('Could not open thread');
      return;
    }
    const sorted = [...r.data.messages].sort(
      (a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime()
    );
    setMessages(sorted);
    setActiveMsg(sorted[sorted.length - 1] ?? null);
  }

  async function submitCompose() {
    if (!activeMsg || !composeMode) return;
    setSending(true);
    let r;
    if (composeMode === 'reply') {
      r = await replyMessage(activeMsg.id, { accountId, html: composeHtml });
    } else if (composeMode === 'reply-all') {
      r = await replyAllMessage(activeMsg.id, { accountId, html: composeHtml });
    } else {
      if (!forwardTo.trim()) {
        setToast('Add a forward recipient');
        setSending(false);
        return;
      }
      r = await forwardMessage(activeMsg.id, { accountId, to: forwardTo.trim(), html: composeHtml });
    }
    setSending(false);
    if (r.live) {
      setToast('Sent');
      setComposeMode(null);
      setComposeHtml('');
      if (selectedId) {
        const t = threads.find((x) => x.threadId === selectedId);
        if (t) openThread(t);
      }
      loadThreads();
    } else {
      setToast('Send failed');
    }
  }

  async function trashSelected() {
    if (!selectedId) return;
    const r = await trashThreads(accountId, [selectedId]);
    setToast(r.live ? 'Moved to trash' : 'Trash failed');
    setSelectedId(null);
    setMessages([]);
    setActiveMsg(null);
    loadThreads();
  }

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  if (loadingAccounts) {
    return (
      <div className="mailbox-shell">
        <p className="dim" style={{ padding: 48, textAlign: 'center' }}>Loading mailbox…</p>
      </div>
    );
  }

  if (noAccount) {
    return (
      <div className="mailbox-shell mailbox-shell--empty">
        {tabBar && <div className="mailbox-topbar">{tabBar}</div>}
        <div className="mail-empty-stage">
          <div className="mail-empty-copy">
            <div className="page-eyebrow">Outreach</div>
            <h1 className="page-title">Your inbox, <em>one place</em></h1>
            <p className="page-desc">
              Connect Gmail to read threads, reply, and send outreach — without leaving Pharma Leads.
            </p>
            <button
              type="button"
              className="btn btn-primary mail-empty-cta"
              onClick={() => { window.location.href = getGmailConnectUrl(); }}
            >
              Connect Gmail
            </button>
            <p className="dim mail-empty-hint">
              Inbox needs read + modify scopes. If you connected earlier for send-only only, connect again.
            </p>
            {onCompose && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={onCompose}>
                Compose without inbox →
              </button>
            )}
          </div>
          <div className="mail-empty-preview" aria-hidden>
            <div className="mail-preview-pane mail-preview-pane--nav" />
            <div className="mail-preview-pane mail-preview-pane--list">
              <div className="mail-preview-row" />
              <div className="mail-preview-row" />
              <div className="mail-preview-row dim-row" />
            </div>
            <div className="mail-preview-pane mail-preview-pane--read">
              <div className="mail-preview-line w80" />
              <div className="mail-preview-line w60" />
              <div className="mail-preview-line w90" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const folderTitle = labelId === ''
    ? 'All mail'
    : (systemLabels.find((l) => l.id === labelId)?.name ?? 'Inbox');

  return (
    <div className="mailbox-shell">
      <div className="mailbox-topbar">
        {tabBar}
        {accounts.length > 1 && (
          <select className="input mailbox-account-select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.email}</option>
            ))}
          </select>
        )}
      </div>

      <div className="mailbox">
        <aside className="mailbox-nav">
          <button type="button" className="btn btn-primary mailbox-new-btn" onClick={() => setNewMsgOpen(true)}>
            ✉ New message
          </button>

          {activeAccount && (
            <div className="mailbox-account-block">
              <div className="avatar">{activeAccount.email[0]?.toUpperCase()}</div>
              <div className="mailbox-account-meta">
                <div className="mailbox-account-name">{displayNameFromEmail(activeAccount.email)}</div>
                <div className="mailbox-account-email">{activeAccount.email}</div>
                <button
                  type="button"
                  className="mailbox-signout"
                  disabled={signingOut}
                  onClick={signOutMailbox}
                >
                  {signingOut ? 'Signing out…' : 'Sign out mailbox'}
                </button>
              </div>
            </div>
          )}

          <div className="mailbox-nav-section">Mails</div>
          <button
            type="button"
            className={`mailbox-label ${labelId === '' ? 'active' : ''}`}
            onClick={() => setLabelId('')}
          >
            <span>All Mails</span>
          </button>
          <button
            type="button"
            className={`mailbox-label ${labelId === 'INBOX' ? 'active' : ''}`}
            onClick={() => setLabelId('INBOX')}
          >
            <span>Inbox</span>
            {inboxUnread != null && inboxUnread > 0 && (
              <span className="mailbox-label-badge">{inboxUnread}</span>
            )}
          </button>
          {systemLabels.filter((l) => !['INBOX'].includes(l.id)).map((l) => (
            <button
              key={l.id}
              type="button"
              className={`mailbox-label ${labelId === l.id ? 'active' : ''}`}
              onClick={() => setLabelId(l.id)}
            >
              <span>{l.name}</span>
              {(l.messagesUnread ?? 0) > 0 && (
                <span className="mailbox-label-badge">{l.messagesUnread}</span>
              )}
            </button>
          ))}

          <div className="mailbox-nav-section">Settings</div>
          <a
            className="mailbox-label mailbox-label-link"
            href={GMAIL_SETTINGS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Gmail settings
          </a>

          <div className="mailbox-nav-section">Add account</div>
          <button
            type="button"
            className="mailbox-label"
            onClick={() => { window.location.href = getGmailConnectUrl(); }}
          >
            Add Gmail account
          </button>

          <div className="mailbox-nav-section">Tools</div>
          {onCompose && (
            <button type="button" className="mailbox-label" onClick={onCompose}>
              Lead compose
            </button>
          )}
          {onTemplates && (
            <button type="button" className="mailbox-label" onClick={onTemplates}>
              My templates
            </button>
          )}
        </aside>

        <section className="mailbox-threads">
          <div className="mailbox-list-head">
            <label className="mailbox-check-wrap" title="Select all">
              <input
                type="checkbox"
                checked={threads.length > 0 && selectedIds.size === threads.length}
                onChange={toggleSelectAll}
              />
            </label>
            <h2>{folderTitle}</h2>
            <div className="mailbox-list-actions">
              <button type="button" className="btn btn-ghost" title="Refresh" onClick={() => loadThreads()}>↻</button>
              <div className="mailbox-menu-wrap">
                <button
                  type="button"
                  className="btn btn-ghost"
                  title="More actions"
                  onClick={() => setMenuOpen((o) => !o)}
                >
                  ⋮
                </button>
                {menuOpen && (
                  <div className="mailbox-menu">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        const unread = threads.filter((t) => t.isUnread).map((t) => t.threadId);
                        markThreadsRead(unread);
                      }}
                    >
                      Mark all read (loaded)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        trashSelectedBulk();
                      }}
                    >
                      Trash selected
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mailbox-toolbar">
            <input
              className="input"
              placeholder="Search messages…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadThreads()}
            />
          </div>
          <div className="mailbox-thread-list">
            {loadingThreads && threads.length === 0 && (
              <p className="dim mailbox-list-empty">Loading…</p>
            )}
            {!loadingThreads && threads.length === 0 && (
              <p className="dim mailbox-list-empty">Nothing here yet</p>
            )}
            {threads.map((t) => (
              <div
                key={t.threadId}
                className={`mailbox-thread-row ${selectedId === t.threadId ? 'active' : ''} ${t.isUnread ? 'unread' : ''}`}
              >
                <label className="mailbox-check-wrap" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(t.threadId)}
                    onChange={() => toggleSelect(t.threadId)}
                  />
                </label>
                <button
                  type="button"
                  className="mailbox-thread-star"
                  title={isStarred(t) ? 'Unstar' : 'Star'}
                  onClick={(e) => toggleStar(t, e)}
                >
                  {isStarred(t) ? '★' : '☆'}
                </button>
                <button type="button" className="mailbox-thread-main" onClick={() => openThread(t)}>
                  <div className="avatar mailbox-thread-avatar">{senderInitial(t.from)}</div>
                  <div className="mailbox-thread-body">
                    <div className="mailbox-thread-top">
                      <span className="mailbox-from">{parseFrom(t.from)}</span>
                      <span className="mailbox-date">{formatDate(t.date)}</span>
                    </div>
                    <div className="mailbox-subject">{t.subject || '(no subject)'}</div>
                    <div className="mailbox-snippet">{t.snippet}</div>
                  </div>
                </button>
              </div>
            ))}
          </div>
          {nextToken && (
            <button type="button" className="btn mailbox-load-more" onClick={() => loadThreads(nextToken)}>
              Load more
            </button>
          )}
        </section>

        <section className="mailbox-detail">
          {!activeMsg ? (
            <div className="mailbox-pick-thread">
              <div className="mailbox-pick-icon">✉</div>
              <h3>Pick a thread</h3>
              <p className="dim">Select a conversation in the list to read messages, attachments, and replies in one place.</p>
            </div>
          ) : (
            <>
              <div className="mailbox-detail-head">
                <h3>{activeMsg.subject || '(no subject)'}</h3>
                <div className="dim mailbox-detail-meta">
                  From {activeMsg.from} · {formatDate(activeMsg.date)}
                </div>
                <div className="mailbox-actions">
                  <button type="button" className="btn" onClick={() => { setComposeMode('reply'); setComposeHtml(''); }}>Reply</button>
                  <button type="button" className="btn" onClick={() => { setComposeMode('reply-all'); setComposeHtml(''); }}>Reply all</button>
                  <button type="button" className="btn" onClick={() => { setComposeMode('forward'); setComposeHtml(''); setForwardTo(''); }}>Forward</button>
                  <button type="button" className="btn" onClick={() => setDraftOpen(true)}>✦ AI draft</button>
                  <button type="button" className="btn" onClick={() => markThreadsRead([selectedId!])}>Mark read</button>
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      if (!selectedId) return;
                      const starred = activeMsg?.labelIds?.includes('STARRED');
                      const r = await batchModifyThreads(accountId, [selectedId], starred
                        ? { removeLabelIds: ['STARRED'] }
                        : { addLabelIds: ['STARRED'] });
                      if (r.live) loadThreads();
                    }}
                  >
                    {activeMsg?.labelIds?.includes('STARRED') ? 'Unstar' : 'Star'}
                  </button>
                  <button type="button" className="btn" onClick={trashSelected}>Trash</button>
                  {messages.length > 1 && (
                    <select
                      className="input"
                      style={{ maxWidth: 160, fontSize: 12 }}
                      value={activeMsg.id}
                      onChange={(e) => setActiveMsg(messages.find((m) => m.id === e.target.value) ?? null)}
                    >
                      {messages.map((m, i) => (
                        <option key={m.id} value={m.id}>Message {i + 1}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div
                className="mailbox-body"
                dangerouslySetInnerHTML={{
                  __html: activeMsg.htmlBody || `<pre>${activeMsg.textBody ?? activeMsg.snippet}</pre>`,
                }}
              />
              {activeMsg.attachments?.length > 0 && (
                <div className="mailbox-attachments">
                  {activeMsg.attachments.map((a) => (
                    <button
                      key={a.attachmentId ?? a.filename}
                      type="button"
                      className="btn"
                      style={{ fontSize: 12 }}
                      onClick={async () => {
                        if (!a.attachmentId) return;
                        const blob = await fetchAttachmentBlob(accountId, activeMsg.id, a.attachmentId);
                        if (!blob) { setToast('Download failed'); return; }
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = a.filename;
                        link.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      ↓ {a.filename}
                    </button>
                  ))}
                </div>
              )}
              {composeMode && (
                <div className="mailbox-compose">
                  {composeMode === 'forward' && (
                    <input className="input" placeholder="To" value={forwardTo} onChange={(e) => setForwardTo(e.target.value)} />
                  )}
                  <textarea
                    className="compose-body"
                    style={{ minHeight: 120 }}
                    value={composeHtml}
                    onChange={(e) => setComposeHtml(e.target.value)}
                    placeholder="Write your reply…"
                  />
                  <div className="compose-foot" style={{ border: 0, padding: '8px 0 0' }}>
                    <button type="button" className="btn" onClick={() => setDraftOpen(true)}>✦ AI draft</button>
                    <span className="spacer" />
                    <button type="button" className="btn" onClick={() => setComposeMode(null)}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={sending} onClick={submitCompose}>
                      {sending ? '◌ Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {newMsgOpen && accountId && (
        <MailComposeModal
          accountId={accountId}
          onClose={() => setNewMsgOpen(false)}
          onSent={() => {
            setToast('Message sent');
            loadThreads();
          }}
        />
      )}
      {draftOpen && (
        <EmailDraftModal
          subject={activeMsg?.subject}
          context={activeMsg?.snippet}
          recipientName={activeMsg ? parseFrom(activeMsg.from) : undefined}
          onPick={(html) => setComposeHtml(html)}
          onClose={() => setDraftOpen(false)}
        />
      )}
      {toast && <div className="toast"><span className="dot" />{toast}</div>}
    </div>
  );
}
