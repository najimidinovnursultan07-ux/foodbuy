'use client';

import { bishkekTime, formatSom, pickText, type GuestBillDto, type Locale, type PaymentMethodDto } from '@qrmenu/shared';
import { messages } from '@/lib/i18n';
import { feePercent } from './parts';
import s from './guest.module.css';

interface Props {
  bill: GuestBillDto | null;
  locale: Locale;
  canOrder: boolean;
  busy: boolean;
  onAddMore: () => void;
  onRequestBill: (method: PaymentMethodDto) => void;
}

export function BillView({ bill, locale, canOrder, busy, onAddMore, onRequestBill }: Props) {
  const t = messages(locale);
  if (!bill) return <p className={s.empty} aria-busy="true">…</p>;
  const b = bill.bill;

  if (!b || b.orders.length === 0) {
    return (
      <>
        <p className={s.empty}>{t.noOrders}</p>
        <div className={s.bottomAction}>
          <button type="button" className={s.primary} onClick={onAddMore}>
            {t.backToMenu}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <ol className={s.orders}>
        {b.orders.map((o) => (
          <li key={o.id} className={s.orderCard} data-testid="order">
            <div className={s.orderHead}>
              <span className={s.dishName}>
                {t.orderN(o.number)} · {bishkekTime(o.createdAt)}
              </span>
              <span className={s.badge} data-status={o.status}>
                {t.status[o.status]}
              </span>
            </div>
            <ul className={s.orderItems}>
              {o.items.map((i) => (
                <li key={i.id} data-cancelled={i.status === 'CANCELLED' || undefined}>
                  <span>
                    {i.quantity} × {pickText(i.name, locale)}
                    {i.modifiers.length > 0 && (
                      <span className={s.dishDesc}> ({i.modifiers.map((m) => pickText(m.name, locale)).join(', ')})</span>
                    )}
                  </span>
                  <span className={s.price}>{formatSom(i.unitPriceTyiyn * i.quantity)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <dl className={s.totals} data-testid="totals">
        <div>
          <dt>{t.subtotal}</dt>
          <dd>{formatSom(b.totals.subtotalTyiyn)}</dd>
        </div>
        {b.totals.serviceFeeBp > 0 && (
          <div>
            <dt>{t.serviceFee(feePercent(b.totals.serviceFeeBp))}</dt>
            <dd>{formatSom(b.totals.serviceFeeTyiyn)}</dd>
          </div>
        )}
        <div className={s.grand}>
          <dt>{t.total}</dt>
          <dd>{formatSom(b.totals.totalTyiyn)}</dd>
        </div>
      </dl>

      {canOrder && (
        <section className={s.payBlock} aria-labelledby="pay-title">
          <h3 id="pay-title" className={s.groupTitle}>
            {t.requestBill}
          </h3>
          {b.requestedPayment ? (
            <p className={s.okNote} role="status">
              {t.billRequested(t.pay[b.requestedPayment])}
            </p>
          ) : (
            <p className={s.hint}>{t.payWith}</p>
          )}
          <div className={s.payButtons}>
            {(['CASH', 'CARD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={s.secondary}
                aria-pressed={b.requestedPayment === m}
                disabled={busy}
                onClick={() => onRequestBill(m)}
              >
                {t.pay[m]}
              </button>
            ))}
          </div>
        </section>
      )}

      {canOrder && (
        <div className={s.bottomAction}>
          <button type="button" className={s.primary} onClick={onAddMore}>
            {t.addMore}
          </button>
        </div>
      )}
    </>
  );
}
