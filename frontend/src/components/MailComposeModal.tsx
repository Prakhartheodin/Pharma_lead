import { useState } from 'react';
import { sendEmail } from '../lib/api';
import { EmailDraftModal } from './EmailDraftModal';

export function MailComposeModal({
  accountId,
  defaultTo = '',
  onClose,
  onSent,
}: {
  accountId: string;
  defaultTo?: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (!to.trim() || !subject.trim()) {
      setErr('Add recipient and subject');
      return;
    }
    setSending(true);
    setErr(null);
    const r = await sendEmail({ accountId, to: to.trim(), subject, body });
    setSending(false);
    if (r.live && r.data?.ok !== false) {
      onSent?.();
      onClose();
    } else {
      setErr('Send failed — check Gmail connection');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal mail-compose-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>New message</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="compose-row">
          <label>To</label>
          <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@company.com" />
        </div>
        <div className="compose-row">
          <label>Subject</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        </div>
        <textarea
          className="compose-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          style={{ minHeight: 200 }}
        />
        {err && <p className="mail-compose-err">{err}</p>}
        <div className="compose-foot">
          <button type="button" className="btn" onClick={() => setAiOpen(true)}>✦ AI draft</button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Discard</button>
          <button type="button" className="btn btn-primary" disabled={sending} onClick={send}>
            {sending ? '◌ Sending…' : 'Send message'}
          </button>
        </div>
      </div>
      {aiOpen && (
        <EmailDraftModal
          subject={subject}
          context={body.slice(0, 500)}
          onPick={(html, sub) => {
            setBody(html);
            if (sub) setSubject(sub);
          }}
          onClose={() => setAiOpen(false)}
        />
      )}
    </div>
  );
}
