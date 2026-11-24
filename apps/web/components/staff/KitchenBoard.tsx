'use client';

import { useState } from 'react';
import { pickText, type KitchenBoardDto, type KitchenTicketDto, type Locale, type StationDto, type TicketAction } from '@qrmenu/shared';
import { useBeep, useNewItemsSignal, useNow, useStaffLive, useStaffLocale } from '@/lib/staff-api';
import { staffMessages, type StaffMessages } from '@/lib/staff-i18n';
import { StaffHeader } from './StaffHeader';
import s from './staff.module.css';

/** Экран кухни/бара (KDS): тёмная тема, крупный шрифт, планшет. */
export function KitchenBoard() {
  const [locale, setLocale] = useStaffLocale();
  const t = staffMessages(locale);
  const [station, setStation] = useState<StationDto | null>(null);
  const live = useStaffLive<KitchenBoardDto>(`/staff/kitchen${station ? `?station=${station}` : ''}`);
  const sound = useBeep();
  const now = useNow();
  const board = live.data;
  const [error, setError] = useState<string | null>(null);

  useNewItemsSignal(board?.tickets.map((x) => `${x.orderId}:${x.station}`) ?? null, sound.beep);

  async function act(ticket: KitchenTicketDto, action: TicketAction) {
    const err = await live.act(`/staff/kitchen/tickets/${ticket.orderId}/${ticket.station}/${action}`);
    setError(err ? (err.status === 409 || err.status === 404 ? t.errStale : t.errGeneric) : null);
  }

  const columns: [KitchenTicketDto['status'], string][] = [
    ['NEW', t.colNew],
    ['IN_PROGRESS', t.colCooking],
    ['READY', t.colReady],
  ];

  return (
    <div className={s.dark}>
      <StaffHeader
        staff={live.session?.staff}
        t={t}
        locale={locale}
        onLocale={setLocale}
        sound={sound}
        offline={live.offline}
        onLogout={live.logout}
      >
        {board && (
          <div className={s.stations} role="tablist">
            {(board.canSwitchStation ? (['KITCHEN', 'BAR'] as const) : [board.station]).map((st) => (
              <button
                key={st}
                type="button"
                role="tab"
                aria-selected={board.station === st}
                className={s.stationBtn}
                disabled={!board.canSwitchStation}
                onClick={() => setStation(st)}
              >
                {st === 'KITCHEN' ? t.kitchen : t.bar}
              </button>
            ))}
          </div>
        )}
      </StaffHeader>

      {error && (
        <p className={s.banner} role="alert">
          {error}
        </p>
      )}

      <main className={s.columns}>
        {columns.map(([status, title]) => {
          const tickets = board?.tickets.filter((x) => x.status === status) ?? [];
          return (
            <section key={status} className={s.column} aria-labelledby={`col-${status}`} data-testid={`col-${status}`}>
              <h2 id={`col-${status}`} className={s.columnTitle}>
                {title} <span className={s.count}>{tickets.length}</span>
              </h2>
              {tickets.length === 0 && <p className={s.muted}>{t.empty}</p>}
              {tickets.map((x) => (
                <Ticket key={`${x.orderId}:${x.station}`} ticket={x} t={t} locale={locale} now={now} alertMinutes={board!.alertMinutes} onAct={act} />
              ))}
            </section>
          );
        })}
      </main>
    </div>
  );
}

function Ticket({
  ticket,
  t,
  locale,
  now,
  alertMinutes,
  onAct,
}: {
  ticket: KitchenTicketDto;
  t: StaffMessages;
  locale: Locale;
  now: number;
  alertMinutes: number;
  onAct: (x: KitchenTicketDto, a: TicketAction) => void;
}) {
  const since = Date.parse(ticket.status === 'READY' && ticket.readyAt ? ticket.readyAt : ticket.sentAt);
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  const mm = Math.floor(sec / 60);
  const level = ticket.status === 'READY' ? 'ok' : mm >= alertMinutes ? 'late' : mm >= Math.ceil(alertMinutes / 2) ? 'warn' : 'ok';

  return (
    <article className={s.ticket} data-level={level} data-testid="ticket">
      <header className={s.ticketHead}>
        <span className={s.ticketTable}>
          {t.table} {ticket.tableLabel}
        </span>
        <span className={s.ticketNum}>{t.orderN(ticket.number)}</span>
        <time className={s.timer} aria-label={`${mm} ${t.min}`}>
          {mm >= 60 ? `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, '0')}` : String(mm).padStart(2, '0')}:
          {String(sec % 60).padStart(2, '0')}
        </time>
      </header>
      <ul className={s.ticketItems}>
        {ticket.items.map((i) => (
          <li key={i.id} data-status={i.status}>
            <span className={s.qty}>{i.quantity}×</span>
            <span>
              {pickText(i.name, locale)}
              {i.modifiers.length > 0 && <span className={s.mods}> · {i.modifiers.map((m) => pickText(m.name, locale)).join(', ')}</span>}
              {i.comment && <span className={s.itemComment}>«{i.comment}»</span>}
            </span>
          </li>
        ))}
      </ul>
      <div className={s.ticketActions}>
        {ticket.status === 'NEW' && (
          <button type="button" className={s.secondaryBtn} onClick={() => onAct(ticket, 'start')}>
            {t.start}
          </button>
        )}
        {ticket.status !== 'READY' && (
          <button type="button" className={s.primaryBtn} onClick={() => onAct(ticket, 'ready')}>
            {t.done}
          </button>
        )}
        {ticket.status !== 'NEW' && (
          <button type="button" className={s.ghostBtn} onClick={() => onAct(ticket, 'back')}>
            {t.undo}
          </button>
        )}
      </div>
    </article>
  );
}
