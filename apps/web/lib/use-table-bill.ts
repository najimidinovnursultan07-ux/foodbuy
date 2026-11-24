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
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    try {
      const next = await guestApi.getBill(slug, token);
      if (my === seq.current) setBill(next); // устаревший ответ не перетирает свежий
    } catch {
      /* сеть моргнула — обновимся по следующему событию */
    }
  }, [slug, token]);

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

  return { bill, refresh };
}
