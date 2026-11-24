'use client';

import { useState } from 'react';
import { formatSom, pickText, type FeedItemDto, type Locale, type PaymentMethodDto, type WaiterFeedDto } from '@qrmenu/shared';
import { useBeep, useNewItemsSignal, useNow, useStaffLive, useStaffLocale } from '@/lib/staff-api';
import { staffMessages, type StaffMessages } from '@/lib/staff-i18n';
import { StaffHeader } from './StaffHeader';
import s from './staff.module.css';

/** Лента официанта (телефон): вызовы → подтверждения → готово забрать → открытые счета. */
export function WaiterFeed() {
  const [locale, setLocale] = useStaffLocale();
  const t = staffMessages(locale);
  const live = useStaffLive<WaiterFeedDto>('/staff/waiter/feed');
  const sound = useBeep();
  const now = useNow(15_000);
  const f = live.data;
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

  // Сигнал на новые вызовы, заказы на подтверждение и «готово»
  useNewItemsSignal(
    f ? [...f.calls.map((c) => `c${c.id}`), ...f.pending.map((p) => `p${p.id}`), ...f.ready.map((r) => `r${r.orderId}${r.items.length}`)] : null,
    sound.beep,
  );

  async function act(path: string, body?: unknown) {
    const err = await live.act(path, body);
    setError(err ? (err.status === 409 ? t.errStale : t.errGeneric) : null);
    return !err;
  }

  const minsAgo = (iso: string) => t.ago(Math.floor((now - Date.parse(iso)) / 60_000));
  const isLate = (iso: string) => f !== null && now - Date.parse(iso) >= f.alertMinutes * 60_000;
  const quiet = f && !f.calls.length && !f.pending.length && !f.ready.length && !f.bills.length;

  return (
    <div className={s.light}>
      <StaffHeader
        staff={live.session?.staff}
        t={t}
        locale={locale}
        onLocale={setLocale}
        sound={sound}
        offline={live.offline}
        onLogout={live.logout}
      />
      {error && (
        <p className={s.banner} role="alert">
          {error}
        </p>
      )}

      <main className={s.feed}>
        {quiet && <p className={s.muted}>{t.allQuiet}</p>}

        {!!f?.calls.length && (
          <section aria-labelledby="sec-calls" data-testid="calls">
            <h2 id="sec-calls" className={s.feedTitle}>
              {t.calls} <span className={s.count}>{f.calls.length}</span>
            </h2>
            {f.calls.map((c) => (
              <article key={c.id} className={s.card} data-kind={c.type} data-late={isLate(c.createdAt) || undefined}>
                <div className={s.cardHead}>
                  <strong className={s.big}>
                    {t.table} {c.tableLabel}
                  </strong>
                  <span className={s.muted}>{minsAgo(c.createdAt)}</span>
                </div>
                <p className={s.cardText}>{c.type === 'BRING_BILL' ? t.bringBill(t.pay[c.paymentMethod ?? 'CASH']) : t.callWaiter}</p>
                <div className={s.cardActions}>
                  {c.status === 'OPEN' ? (
                    <button type="button" className={s.secondaryBtn} onClick={() => act(`/staff/calls/${c.id}/ack`)}>
                      {t.ack}
                    </button>
                  ) : (
                    <span className={s.tag}>{c.handledByMe ? t.youreOnIt : '…'}</span>
                  )}
                  <button type="button" className={s.primaryBtn} onClick={() => act(`/staff/calls/${c.id}/done`)}>
                    {t.callDone}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {!!f?.pending.length && (
          <section aria-labelledby="sec-pending" data-testid="pending">
            <h2 id="sec-pending" className={s.feedTitle}>
              {t.pending} <span className={s.count}>{f.pending.length}</span>
            </h2>
            {f.pending.map((o) => (
              <article key={o.id} className={s.card} data-late={isLate(o.createdAt) || undefined}>
                <div className={s.cardHead}>
                  <strong className={s.big}>
                    {t.table} {o.tableLabel} · {t.orderN(o.number)}
                  </strong>
                  <span className={s.muted}>{minsAgo(o.createdAt)}</span>
                </div>
                <Items items={o.items} locale={locale} t={t} />
                <p className={s.cardTotal}>{formatSom(o.totalTyiyn)}</p>
                <div className={s.cardActions}>
                  <button type="button" className={s.ghostBtn} onClick={() => act(`/staff/orders/${o.id}/reject`)}>
                    {t.reject}
                  </button>
                  <button type="button" className={s.primaryBtn} onClick={() => act(`/staff/orders/${o.id}/confirm`)}>
                    {t.confirm}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {!!f?.ready.length && (
          <section aria-labelledby="sec-ready" data-testid="ready">
            <h2 id="sec-ready" className={s.feedTitle}>
              {t.ready} <span className={s.count}>{f.ready.length}</span>
            </h2>
            {f.ready.map((r) => (
              <article key={r.orderId} className={s.card} data-kind="READY">
                <div className={s.cardHead}>
                  <strong className={s.big}>
                    {t.table} {r.tableLabel} · {t.orderN(r.number)}
                  </strong>
                  <span className={s.muted}>{minsAgo(r.readyAt)}</span>
                </div>
                <Items items={r.items} locale={locale} t={t} />
                <div className={s.cardActions}>
                  <button type="button" className={s.primaryBtn} onClick={() => act(`/staff/orders/${r.orderId}/served`)}>
                    {t.served}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

        {!!f?.bills.length && (
          <section aria-labelledby="sec-bills" data-testid="bills">
            <h2 id="sec-bills" className={s.feedTitle}>
              {t.bills} <span className={s.count}>{f.bills.length}</span>
            </h2>
            {f.bills.map((b) => (
              <article key={b.id} className={s.card} data-testid="bill">
                <div className={s.cardHead}>
                  <strong className={s.big}>
                    {t.table} {b.tableLabel}
                  </strong>
                  <strong className={s.big}>{formatSom(b.totals.totalTyiyn)}</strong>
                </div>
                <p className={s.muted}>
                  {t.ordersCount(b.ordersCount)} · {minsAgo(b.openedAt)}
                  {b.requestedPayment && <> · {t.wantsPay(t.pay[b.requestedPayment])}</>}
                </p>
                {b.hasUnserved && <p className={s.warn}>{t.unserved}</p>}
                {closing === b.id ? (
                  <div className={s.cardActions}>
                    <span className={s.cardText}>{t.closeHow}</span>
                    {(['CASH', 'CARD'] as PaymentMethodDto[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={b.requestedPayment === m ? s.primaryBtn : s.secondaryBtn}
                        onClick={async () => {
                          if (await act(`/staff/bills/${b.id}/close`, { paidWith: m })) setClosing(null);
                        }}
                      >
                        {t.pay[m]}
                      </button>
                    ))}
                    <button type="button" className={s.ghostBtn} onClick={() => setClosing(null)}>
                      {t.cancel}
                    </button>
                  </div>
                ) : (
                  <div className={s.cardActions}>
                    <button type="button" className={s.secondaryBtn} onClick={() => setClosing(b.id)}>
                      {t.closeBill}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function Items({ items, locale, t }: { items: FeedItemDto[]; locale: Locale; t: StaffMessages }) {
  return (
    <ul className={s.feedItems}>
      {items.map((i) => (
        <li key={i.id}>
          {i.quantity} × {pickText(i.name, locale)}
          {i.modifiers.length > 0 && <span className={s.muted}> · {i.modifiers.map((m) => pickText(m.name, locale)).join(', ')}</span>}
          {i.station === 'BAR' && <span className={s.tag}>{t.barTag}</span>}
          {i.comment && <span className={s.itemComment}>«{i.comment}»</span>}
        </li>
      ))}
    </ul>
  );
}
