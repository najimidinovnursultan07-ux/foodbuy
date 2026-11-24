'use client';

import { useEffect, useRef, useState } from 'react';
import { bishkekDate, formatSom, pickText, type ReportDto } from '@qrmenu/shared';
import { useAdmin } from '@/lib/admin-api';
import type { AdminMessages } from '@/lib/admin-i18n';
import { ErrorNote } from './fields';
import s from './admin.module.css';

const DAY = 86_400_000;
const shift = (date: string, days: number) => bishkekDate(new Date(Date.parse(`${date}T12:00:00+06:00`) + days * DAY));

export function ReportsAdmin() {
  const { t, locale, api, errorText } = useAdmin();
  const today = bishkekDate();
  const presets: [string, string, string][] = [
    [t.today, today, today],
    [t.yesterday, shift(today, -1), shift(today, -1)],
    [t.last7, shift(today, -6), today],
    [t.last30, shift(today, -29), today],
  ];
  const [range, setRange] = useState({ from: shift(today, -6), to: today });
  const [report, setReport] = useState<ReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (range.from > range.to) return;
    api
      .get<ReportDto>(`/admin/reports?from=${range.from}&to=${range.to}`)
      .then((r) => {
        setReport(r);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [api, range, errorText]);

  return (
    <section>
      <div className={s.pageHead}>
        <h1>{t.reportsTitle}</h1>
      </div>

      {/* Фильтры — одной строкой над графиком */}
      <div className={s.filters} role="group" aria-label={t.period}>
        {presets.map(([label, from, to]) => (
          <button
            key={label}
            type="button"
            className={s.chip}
            aria-pressed={range.from === from && range.to === to}
            onClick={() => setRange({ from, to })}
          >
            {label}
          </button>
        ))}
        <label className={s.dateField}>
          <span className={s.visuallyHidden}>{t.from}</span>
          <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} />
        </label>
        <span>—</span>
        <label className={s.dateField}>
          <span className={s.visuallyHidden}>{t.to}</span>
          <input type="date" value={range.to} min={range.from} max={today} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} />
        </label>
      </div>
      <p className={s.muted}>{t.reportsHint}</p>
      <ErrorNote text={error} />

      {report && (
        <>
          <div className={s.card}>
            <p className={s.heroLabel}>{t.revenue}</p>
            <p className={s.hero} data-testid="revenue">
              {formatSom(report.revenueTyiyn)}
            </p>
            <dl className={s.tiles}>
              <Tile label={t.bills} value={String(report.billsCount)} testId="bills" />
              <Tile label={t.avgCheck} value={formatSom(report.avgCheckTyiyn)} testId="avg" />
              <Tile label={t.orders} value={String(report.ordersCount)} />
              <Tile label={t.cash} value={formatSom(report.cashTyiyn)} />
              <Tile label={t.card} value={formatSom(report.cardTyiyn)} />
              <Tile label={t.serviceFeeSum} value={formatSom(report.serviceFeeTyiyn)} />
            </dl>
          </div>

          {report.billsCount === 0 ? (
            <p className={`${s.card} ${s.muted}`}>{t.noData}</p>
          ) : (
            <>
              {report.byDay.length > 1 && (
                <div className={s.card}>
                  <h2>{t.revenueByDay}</h2>
                  <DayColumns data={report.byDay} t={t} locale={locale} />
                </div>
              )}
              <div className={s.card}>
                <h2>{t.topDishes}</h2>
                <table className={s.table} data-testid="top-dishes">
                  <thead>
                    <tr>
                      <th scope="col">{t.dish}</th>
                      <th scope="col" className={s.num}>
                        {t.qty}
                      </th>
                      <th scope="col" className={s.num}>
                        {t.sum}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topDishes.map((d, i) => (
                      <tr key={i}>
                        <td>{pickText(d.name, locale)}</td>
                        <td className={s.num}>{d.quantity}</td>
                        <td className={s.num}>{formatSom(d.revenueTyiyn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Tile({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className={s.tile}>
      <dt>{label}</dt>
      <dd data-testid={testId}>{value}</dd>
    </div>
  );
}

/** Ровная шкала: 1, 2, 5 × 10ⁿ */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
/** Подписи оси в одном стиле: если шкала дошла до 10 000 сом — все в K (0 / 5K / 10K), до миллиона — в M. */
const axisFormatter = (maxTyiyn: number) => {
  const maxSom = maxTyiyn / 100;
  if (maxSom >= 1_000_000) return (t: number) => (t === 0 ? '0' : `${String(t / 100 / 1_000_000).replace('.', ',')}M`);
  if (maxSom >= 10_000) return (t: number) => (t === 0 ? '0' : `${String(t / 100 / 1000).replace('.', ',')}K`);
  return (t: number) => String(t / 100);
};

/** Столбцы выручки по дням: одна серия, без легенды; подсказка при наведении и с клавиатуры; таблица — рядом. */
function DayColumns({ data, t, locale }: { data: ReportDto['byDay']; t: AdminMessages; locale: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 220;
  const pad = { top: 12, right: 8, bottom: 28, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.revenueTyiyn)));
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const fmtTick = axisFormatter(max);
  const slot = plotW / data.length;
  const barW = Math.max(2, Math.min(24, slot - 2)); // ≤ 24px, остаток — воздух; ≥ 2px зазор
  const labelEvery = Math.ceil(data.length / Math.floor(plotW / 56));
  const fmtDay = (d: string) =>
    new Intl.DateTimeFormat(locale === 'ky' ? 'ky-KG' : locale === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${d}T00:00:00Z`),
    );
  const cur = active === null ? null : data[active]!;

  return (
    <div ref={ref} className={s.chart}>
      <svg width={width} height={H} role="img" aria-label={t.revenueByDay}>
        {ticks.map((v) => {
          const y = pad.top + plotH - (v / max) * plotH;
          return (
            <g key={v}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className={s.gridLine} />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" className={s.axisText}>
                {fmtTick(v)}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.revenueTyiyn / max) * plotH;
          const x = pad.left + i * slot + (slot - barW) / 2;
          const y = pad.top + plotH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g
              key={d.date}
              tabIndex={0}
              role="button"
              aria-label={`${fmtDay(d.date)}: ${formatSom(d.revenueTyiyn)}, ${t.bills.toLowerCase()} ${d.billsCount}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className={s.barGroup}
            >
              {/* зона наведения — шире столбца */}
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${y + r} a${r},${r} 0 0 1 ${r},${-r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${pad.top + plotH} H${x} Z`}
                  className={s.bar}
                  data-active={active === i || undefined}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={pad.left + i * slot + slot / 2} y={H - 8} textAnchor="middle" className={s.axisText}>
                  {fmtDay(d.date)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} className={s.baseline} />
      </svg>
      {cur && active !== null && (
        <div
          className={s.tooltip}
          style={{ left: Math.min(width - 160, Math.max(0, pad.left + active * slot + slot / 2 - 80)), top: 0 }}
          role="status"
        >
          <strong>{fmtDay(cur.date)}</strong>
          <span>{formatSom(cur.revenueTyiyn)}</span>
          <span className={s.muted}>
            {t.bills}: {cur.billsCount}
          </span>
        </div>
      )}
      <details className={s.tableView}>
        <summary>{t.tableView}</summary>
        <table className={s.table}>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td>{fmtDay(d.date)}</td>
                <td className={s.num}>{formatSom(d.revenueTyiyn)}</td>
                <td className={s.num}>{d.billsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
