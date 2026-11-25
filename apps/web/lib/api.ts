import { cache } from 'react';
import type { PublicMenuDto } from '@qrmenu/shared';

/**
 * Адрес API для серверного рендера:
 *  - на Vercel — API_URL из привязки сервиса web → api (внутренний адрес, без публичного /api);
 *  - в docker compose — API_INTERNAL_URL (имя контейнера);
 *  - локально — NEXT_PUBLIC_API_URL.
 * Читается при каждом запросе: привязки доступны только во время работы функции, не при сборке.
 */
const serverApi = () =>
  (process.env.API_URL ?? process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export type MenuResult =
  | { kind: 'ok'; menu: PublicMenuDto }
  | { kind: 'not_found' }
  | { kind: 'disabled' }
  | { kind: 'error' };

/** Один запрос к API на рендер: метаданные и страница берут результат из React cache. */
export const fetchMenu = cache(async function fetchMenu(slug: string, token: string): Promise<MenuResult> {
  try {
    const res = await fetch(`${serverApi()}/public/menu/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      // Бесплатный сервер API засыпает и просыпается до минуты — ждём, а не показываем ошибку
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 404) return { kind: 'not_found' };
    if (res.status === 403) return { kind: 'disabled' };
    if (!res.ok) return { kind: 'error' };
    return { kind: 'ok', menu: (await res.json()) as PublicMenuDto };
  } catch {
    return { kind: 'error' };
  }
});
