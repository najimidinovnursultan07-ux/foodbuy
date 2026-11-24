'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuestBillDto } from '@qrmenu/shared';
import { API_URL, guestApi } from './guest-api';

/**
 * Счёт стола в реальном времени.
 * Сокет подключается лениво (не мешает первой отрисовке меню) и входит в комнату стола;
 * на любое событие стола и при возврате на вкладку счёт перечитывается целиком —
 * так пропущенные события на плохой сети не приводят к рассинхрону.
 */
export function useTableBill(slug: string, token: string) {
  const [bill, setBill] = useState<GuestBillDto | null>(null);
  /** Счёт, который это устройство видело открытым, а теперь он закрыт — повод попросить отзыв */
  const [closedBillId, setClosedBillId] = useState<string | null>(null);
  const seq = useRef(0);
  const storeKey = `qrmenu:openbill:${token}`;

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    try {
      const next = await guestApi.getBill(slug, token);
      if (my !== seq.current) return; // устаревший ответ не перетирает свежий
      setBill(next);
      const seen = safeGet(storeKey);
      if (next.bill && next.bill.orders.length) safeSet(storeKey, next.bill.id);
      else if (seen && seen !== next.bill?.id) setClosedBillId(seen);
    } catch {
      /* сеть моргнула — обновимся по следующему событию */
    }
  }, [slug, token, storeKey]);

  /** Отзыв оставлен или гость отказался — больше не спрашиваем про этот счёт. */
  const forgetClosedBill = useCallback(() => {
    safeRemove(storeKey);
    setClosedBillId(null);
  }, [storeKey]);

  useEffect(() => {
    let closed = false;
    let socket: { close(): void } | undefined;
    void refresh();

    void import('socket.io-client').then(({ io }) => {
      if (closed) return;
      const s = io(API_URL, { transports: ['websocket', 'polling'] });
      s.on('connect', () => {
        s.emit('guest:join', { slug, token });
        void refresh(); // после переподключения могли что-то пропустить
      });
      s.on('table.updated', () => void refresh());
      socket = s;
    });

    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      socket?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [slug, token, refresh]);

  return { bill, refresh, closedBillId, forgetClosedBill };
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* приватный режим */
  }
}
function safeRemove(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {
    /* приватный режим */
  }
}
