import { useEffect, useRef, useState } from 'react';
import { DRUG_OPTIONS } from '../lib/drugs';

/**
 * Multi-select dropdown for the Religence product portfolio.
 * Selected drugs are kept as a string[] (drug names) to match the search API contract.
 */
export function DrugSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selected = new Set(value);
  function toggle(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(DRUG_OPTIONS.filter((d) => next.has(d.name)).map((d) => d.name));
  }

  const filtered = DRUG_OPTIONS.filter((d) =>
    d.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="drugselect" ref={ref}>
      <button
        type="button"
        className="drugselect-control input"
        onClick={() => setOpen((o) => !o)}
      >
        {value.length === 0 ? (
          <span className="drugselect-ph">Select drugs…</span>
        ) : (
          <span className="chips">
            {value.map((d) => (
              <span key={d} className="chip">
                {d}
                <span
                  className="chip-x"
                  role="button"
                  aria-label={`Remove ${d}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(d);
                  }}
                >
                  ×
                </span>
              </span>
            ))}
          </span>
        )}
        <span className="drugselect-caret">▾</span>
      </button>

      {open && (
        <div className="drugselect-menu">
          <div className="drugselect-search">
            <input
              className="input"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter products…"
            />
            {value.length > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => onChange([])}>
                Clear
              </button>
            )}
          </div>
          <div className="drugselect-list">
            {filtered.length === 0 ? (
              <div className="drugselect-empty">No products match “{query}”.</div>
            ) : (
              filtered.map((d) => (
                <label key={d.name} className="drugselect-opt">
                  <input
                    type="checkbox"
                    checked={selected.has(d.name)}
                    onChange={() => toggle(d.name)}
                  />
                  <span className="drugselect-name">{d.name}</span>
                  <span className="drugselect-ref">{d.ref}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
