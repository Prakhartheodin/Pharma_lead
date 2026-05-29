import { useEffect } from 'react';
import type { Template } from '../lib/types';

export function TemplatePicker({
  templates, onPick, onClose,
}: { templates: Template[]; onPick: (t: Template) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Job templates">
        <div className="modal-head">
          <h3 style={{ fontSize: 18 }}>Job templates</h3>
          <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
            Pick a template — variables like <code style={{ fontFamily: 'var(--mono)' }}>{'{{company_name}}'}</code> fill from the selected lead.
          </p>
        </div>
        <div className="modal-body">
          {templates.map((t) => (
            <div className="tpl" key={t.id} onClick={() => onPick(t)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onPick(t)}>
              <h5>{t.name}</h5>
              <div className="subj">Subject: {t.subject}</div>
              <div className="preview">{t.bodyHtml.replace(/\n+/g, ' ')}</div>
              <div className="chips vars">
                {t.variables.map((v) => <span key={v} className="chip ghost">{`{{${v}}}`}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
