import { useEffect, useState, type ReactNode } from 'react';
import type { PersonalTemplate } from '../lib/types';
import {
  createPersonalTemplate,
  deletePersonalTemplate,
  listPersonalTemplates,
  updatePersonalTemplate,
} from '../lib/emailApi';

export function PersonalTemplates({ tabBar }: { tabBar?: ReactNode }) {
  const [own, setOwn] = useState<PersonalTemplate[]>([]);
  const [shared, setShared] = useState<PersonalTemplate[]>([]);
  const [editing, setEditing] = useState<PersonalTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  async function reload() {
    const r = await listPersonalTemplates();
    if (r.live) {
      setOwn(r.data.own);
      setShared(r.data.shared);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function startNew() {
    setEditing({ id: '', title: '', subject: '', bodyHtml: '' });
    setTitle('');
    setSubject('');
    setBodyHtml('');
  }

  function startEdit(t: PersonalTemplate) {
    setEditing(t);
    setTitle(t.title);
    setSubject(t.subject ?? '');
    setBodyHtml(t.bodyHtml);
  }

  async function save() {
    if (!title.trim() || !bodyHtml.trim()) {
      setToast('Title and body are required');
      return;
    }
    if (editing?.id) {
      const r = await updatePersonalTemplate(editing.id, { title, subject, bodyHtml });
      setToast(r.live ? 'Template updated' : 'Save failed');
    } else {
      const r = await createPersonalTemplate({ title, subject, bodyHtml });
      setToast(r.live ? 'Template created' : 'Save failed');
    }
    setEditing(null);
    reload();
  }

  async function remove(id: string) {
    const r = await deletePersonalTemplate(id);
    setToast(r.live ? 'Deleted' : 'Delete failed');
    reload();
  }

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Outreach</div>
          <h1 className="page-title">My <em>templates</em></h1>
          <p className="page-desc">
            Personal Gmail templates stored in Mongo. Job defaults stay under pharma-templates; use these in the inbox and compose flows.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
          {tabBar}
          <button type="button" className="btn btn-primary" onClick={startNew}>+ New template</button>
        </div>
      </div>

      <div className="compose-grid">
        <div>
          <div className="aside-card" style={{ marginBottom: 16 }}>
            <h4>Your templates ({own.length})</h4>
            {own.length === 0 && <p className="dim" style={{ fontSize: 13 }}>None yet — create one for reuse in Gmail compose.</p>}
            {own.map((t) => (
              <div key={t.id} className="recip" style={{ cursor: 'pointer' }} onClick={() => startEdit(t)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  {t.subject && <div className="dim" style={{ fontSize: 12 }}>{t.subject}</div>}
                </div>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); remove(t.id); }}>Delete</button>
              </div>
            ))}
          </div>
          {shared.length > 0 && (
            <div className="aside-card">
              <h4>Shared ({shared.length})</h4>
              {shared.map((t) => (
                <div key={t.id} className="recip" onClick={() => startEdit(t)}>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {editing && (
          <div className="compose-card">
            <div className="compose-head"><h3>{editing.id ? 'Edit' : 'New'} template</h3></div>
            <div className="compose-row">
              <label>Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="compose-row">
              <label>Subject</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Optional default subject" />
            </div>
            <textarea className="compose-body" value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="HTML body — use {{company_name}} etc. when sending from leads" />
            <div className="compose-foot">
              <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <span className="spacer" />
              <button type="button" className="btn btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        )}
      </div>
      {toast && <div className="toast"><span className="dot" />{toast}</div>}
    </div>
  );
}
