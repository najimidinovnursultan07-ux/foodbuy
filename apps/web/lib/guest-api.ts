'use client';

import type {
  CreateCallRequest,
  CreateOrderRequest,
  CreateOrderResponse,
  GuestBillDto,
  GuestErrorBody,
  ReviewRequest,
  ReviewResponse,
  ReviewStatusDto,
} from '@qrmenu/shared';

/** Публичный адрес API для браузера: локально — http://localhost:4000, на Vercel — относительный /api. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/**
 * Подключение Socket.IO к API: origin и путь берутся из API_URL, так что /api на Vercel
 * превращается в /api/socket.io. Только WebSocket: на Vercel Functions long-polling не работает.
 */
export function socketTarget(): { url: string; options: { path: string; transports: ['websocket'] } } {
  const base = new URL(API_URL, window.location.href);
  return { url: base.origin, options: { path: `${base.pathname.replace(/\/$/, '')}/socket.io`, transports: ['websocket'] } };
}

export class GuestApiError extends Error {
  constructor(public readonly body: Partial<GuestErrorBody> | null) {
    super(body?.code ?? 'NETWORK');
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...init?.headers },
      signal: AbortSignal.timeout(60_000), // с запасом на пробуждение сервера API
    });
  } catch {
    throw new GuestApiError(null); // нет сети / таймаут
  }
  if (!res.ok) throw new GuestApiError(await res.json().catch(() => null));
  return (await res.json()) as T;
}

const seg = (slug: string, token: string) => `${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;

export const guestApi = {
  getBill: (slug: string, token: string) => call<GuestBillDto>(`/public/bill/${seg(slug, token)}`),
  createOrder: (slug: string, token: string, body: CreateOrderRequest) =>
    call<CreateOrderResponse>(`/public/orders/${seg(slug, token)}`, { method: 'POST', body: JSON.stringify(body) }),
  reviewStatus: (slug: string, token: string, billId: string) =>
    call<ReviewStatusDto>(`/public/reviews/${seg(slug, token)}/${encodeURIComponent(billId)}`),
  createReview: (slug: string, token: string, body: ReviewRequest) =>
    call<ReviewResponse>(`/public/reviews/${seg(slug, token)}`, { method: 'POST', body: JSON.stringify(body) }),
  createCall: (slug: string, token: string, body: CreateCallRequest) =>
    call<{ callId: string }>(`/public/calls/${seg(slug, token)}`, { method: 'POST', body: JSON.stringify(body) }),
};

/** Анонимный id устройства — только для лимита заказов, не для слежки. */
export function deviceId(): string {
  const KEY = 'qrmenu:device';
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
