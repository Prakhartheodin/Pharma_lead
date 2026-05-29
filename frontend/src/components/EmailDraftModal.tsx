import { useState } from 'react';
import type { EmailDraftLength, EmailDraftTone, EmailDraftOption } from '../lib/types';
import { generateDraft } from '../lib/emailApi';

const TONES: { id: EmailDraftTone; label: string }[] = [
  { id: 'professional', label: 'Professional' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'formal', label: 'Formal' },
  { id: 'persuasive', label: 'Persuasive' },
  { id: 'empathetic', label: 'Empathetic' },
];

export function EmailDraftModal(props: {
  subject?: string;
  context?: string;
  recipientName?: string;
  onPick: (html: string, subject?: string) => void;
  onClose: () => void;
}) {
  const [tone, setTone] = useState<EmailDraftTone>('professional');
  const [length, setLength] = useState<EmailDraftLength>('medium');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<EmailDraftOption[]>([]);
  const [genSubject, setGenSubject] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function runGenerate() {
    if (prompt.trim().length < 3) {
      setError('Describe what you want to say (at least a few words).');
      return;
    }
    setLoading(true);
    setError(null);
    const r = await generateDraft({
      tone,
      length,
      prompt: prompt.trim(),
      subject: props.subject,
      context: props.context,
      recipientName: props.recipientName,
    });
    setLoading(false);
    if (!r.live || !r.data?.options?.length) {
      setError('Could not generate drafts — check OPENAI_API_KEY on the API.');
      return;
    }
    setOptions(r.data.options);
    setGenSubject(r.data.subject ?? props.subject ?? '');
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3>AI draft</h3>
          <button type="button" className="btn btn-ghost" onClick={props.onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`btn ${tone === t.id ? 'btn-primary' : ''}`}
                style={{ fontSize: 12 }}
                onClick={() => setTone(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <select className="input" value={length} onChange={(e) => setLength(e.target.value as EmailDraftLength)}>
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
          <textarea
            className="input"
            rows={3}
            placeholder="e.g. Follow up on API sourcing enquiry, mention MOQ flexibility…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          {error && <p style={{ color: 'var(--bad)', fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="button" className="btn btn-primary" onClick={runGenerate} disabled={loading}>
            {loading ? '◌ Generating…' : 'Generate options'}
          </button>
          {options.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {genSubject && <div className="dim" style={{ fontSize: 12 }}>Subject: <b>{genSubject}</b></div>}
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="aside-card"
                  style={{ textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => {
                    props.onPick(o.html, genSubject || undefined);
                    props.onClose();
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{o.label}</div>
                  <div className="dim" style={{ fontSize: 12, maxHeight: 72, overflow: 'hidden' }}
                    dangerouslySetInnerHTML={{ __html: o.html }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
