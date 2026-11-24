'use client';

import { useState, type FormEvent } from 'react';
import type { AdminTableDto } from '@qrmenu/shared';
import { useAdmin, useAdminData } from '@/lib/admin-api';
import { ErrorNote } from './fields';
import s from './admin.module.css';

/** «1-10, Терраса, 12» → ["1",…,"10","Терраса","12"] */
export function parseLabels(input: string): string[] {
  const out: string[] = [];
  for (const part of input.split(/[,;\n]+/)) {
    const p = part.trim();
    if (!p) continue;
    const range = /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/.exec(p);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])];
      for (let i = Math.min(a, b); i <= Math.max(a, b) && out.length < 100; i++) out.push(String(i));
    } else out.push(p.slice(0, 20));
  }
  return [...new Set(out)];
}

export function TablesAdmin() {
  const { t, api, errorText } = useAdmin();
  const { data: tables, error: loadError, reload } = useAdminData<AdminTableDto[]>('/admin/tables');
  const [labels, setLabels] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
    await reload();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const list = parseLabels(labels);
    if (!list.length) return;
    await run(async () => {
      await api.send('POST', '/admin/tables', { labels: list });
      setLabels('');
    });
  }

  if (!tables) return <p className={s.loading}>{loadError ?? t.loading}</p>;

  return (
    <section>
      <div className={s.pageHead}>
        <h1>{t.tablesTitle}</h1>
        <div className={s.actions}>
          {selected.length > 0 && (
            <button type="button" className={s.btn} onClick={() => run(() => api.download(`/admin/tables/qr.pdf?ids=${selected.join(',')}`, 'qr-tables.pdf'))}>
              {t.downloadSelected(selected.length)}
            </button>
          )}
          <button type="button" className={s.primary} onClick={() => run(() => api.download('/admin/tables/qr.pdf', 'qr-tables.pdf'))}>
            ⬇ {t.downloadAll}
          </button>
        </div>
      </div>

      <form className={s.card} onSubmit={add}>
        <label className={s.field}>
          {t.tableLabels}
          <span className={s.inline}>
            <input value={labels} onChange={(e) => setLabels(e.target.value)} placeholder={t.tableLabelsHint} />
            <button type="submit" className={s.primary} disabled={!parseLabels(labels).length}>
              {t.addTables}
            </button>
          </span>
        </label>
      </form>
      <ErrorNote text={error} />

      <ul className={`${s.card} ${s.rows}`}>
        {tables.map((tb) => (
          <li key={tb.id} className={s.row} data-testid="table-row" data-inactive={!tb.isActive || undefined}>
            <input
              type="checkbox"
              aria-label={`${t.select}: ${t.table} ${tb.label}`}
              checked={selected.includes(tb.id)}
              disabled={!tb.isActive}
              onChange={(e) => setSelected(e.target.checked ? [...selected, tb.id] : selected.filter((x) => x !== tb.id))}
              className={s.check}
            />
            <div className={s.rowMain}>
              <strong>
                {t.table} {tb.label}
              </strong>
              <span className={s.muted}>
                {!tb.isActive && <span className={s.badge}>{t.disabled}</span>}
                {tb.hasOpenBill && <span className={s.badgeOk}>{t.openBill}</span>}
              </span>
            </div>
            <div className={s.actions}>
              <a className={s.btn} href={tb.url} target="_blank" rel="noreferrer">
                {t.link}
              </a>
              <button
                type="button"
                className={s.btn}
                onClick={async () => {
                  await navigator.clipboard?.writeText(tb.url).catch(() => undefined);
                  setCopied(tb.id);
                  setTimeout(() => setCopied(null), 1500);
                }}
              >
                {copied === tb.id ? t.copied : t.copyLink}
              </button>
              <button type="button" className={s.btn} onClick={() => confirm(t.reissueConfirm) && run(() => api.send('POST', `/admin/tables/${tb.id}/reissue`))}>
                {t.reissue}
              </button>
              <button type="button" className={s.btn} onClick={() => run(() => api.send('PATCH', `/admin/tables/${tb.id}`, { isActive: !tb.isActive }))}>
                {tb.isActive ? t.disable : t.enable}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
