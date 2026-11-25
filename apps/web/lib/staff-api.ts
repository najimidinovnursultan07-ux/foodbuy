'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALES, type Locale, type StaffLoginResponse, type StaffProfileDto } from '@qrmenu/shared';
import { API_URL, socketTarget } from './guest-api';

const SESSION_KEY = 'qrmenu:staff';
const LANG_KEY = 'qrmenu:staff-lang';

export class StaffApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

// ───────── Сессия на устройстве ─────────

export function saveSession(s: StaffLoginResponse) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}
export function loadSession(): StaffLoginResponse | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as StaffLoginResponse | null;
  } catch {
    return null;
  }
}
export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function homeFor(staff: StaffProfileDto): string {
  return staff.role === 'kitchen' ? '/staff/kitchen' : staff.role === 'manager' ? '/admin' : '/staff/waiter';
}

// ───────── Запросы ─────────

export async function staffFetch<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
      signal: AbortSignal.timeout(60_000), // с запасом на пробуждение сервера API
    });
  } catch {
    throw new StaffApiError(0, 'NETWORK');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { code?: string } | null;
    throw new StaffApiError(res.status, body?.code ?? 'UNKNOWN');
  }
  return (await res.json()) as T;
}

// ───────── Язык ─────────

export function useStaffLocale(): [Locale, (l: Locale) => void] {
  const [locale, setLocale] = useState<Locale>('ru');
  useEffect(() => {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && (LOCALES as readonly string[]).includes(saved)) setLocale(saved as Locale);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const change = useCallback((l: Locale) => {
    setLocale(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  return [locale, change];
}

// ───────── Живые данные ─────────

/**
 * Данные экрана персонала: загрузка, вход в комнату ресторана по сокету и перечитывание
 * при любом событии, переподключении, возврате на вкладку и раз в 30 с (страховка).
 * Без сессии или при 401 — на экран входа.
 */
export function useStaffLive<T>(path: string) {
  const router = useRouter();
  const [session, setSession] = useState<StaffLoginResponse | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [offline, setOffline] = useState(false);
  const seq = useRef(0);
  const tokenRef = useRef<string | null>(null);

  const logout = useCallback(() => {
    clearSession();
    router.replace('/staff');
  }, [router]);

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    try {
      const next = await staffFetch<T>(path, tokenRef.current);
      if (my === seq.current) {
        setData(next);
        setOffline(false);
      }
    } catch (e) {
      if (e instanceof StaffApiError && (e.status === 401 || e.status === 403)) logout();
      else setOffline(true);
    }
  }, [path, logout]);

  useEffect(() => {
    const s = loadSession();
    if (!s) {
      router.replace('/staff');
      return;
    }
    setSession(s);
    tokenRef.current = s.token;
    void refresh();

    let closed = false;
    let socket: { close(): void } | undefined;
    void import('socket.io-client').then(({ io }) => {
      if (closed) return;
      const sock = io(socketTarget().url, socketTarget().options);
      sock.on('connect', () => {
        sock.emit('staff:join', { token: s.token });
        void refresh();
      });
      sock.on('disconnect', () => setOffline(true));
      sock.onAny(() => void refresh());
      socket = sock;
    });
    const timer = setInterval(() => void refresh(), 30_000);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      socket?.close();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, router]);

  /** Действие (POST) с перечитыванием данных после. */
  const act = useCallback(
    async (actionPath: string, body?: unknown) => {
      try {
        await staffFetch(actionPath, tokenRef.current, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
        return null;
      } catch (e) {
        if (e instanceof StaffApiError && e.status === 401) logout();
        return e instanceof StaffApiError ? e : new StaffApiError(0, 'NETWORK');
      } finally {
        await refresh();
      }
    },
    [refresh, logout],
  );

  return { session, data, offline, refresh, act, logout };
}

/** Текущее время, обновляется раз в секунду — для таймеров. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Короткий сигнал. Браузер разрешает звук только после касания — поэтому кнопка «Включить звук». */
export function useBeep() {
  const ctx = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);
  const enable = useCallback(() => {
    ctx.current ??= new AudioContext();
    void ctx.current.resume();
    setEnabled(true);
  }, []);
  const beep = useCallback(() => {
    if ('vibrate' in navigator) navigator.vibrate?.(200);
    const c = ctx.current;
    if (!c || !enabled) return;
    for (const [i, f] of [880, 1320].entries()) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.25, c.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.18 + 0.16);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + i * 0.18);
      o.stop(c.currentTime + i * 0.18 + 0.17);
    }
  }, [enabled]);
  return { enabled, enable, beep };
}

/** Сигнал, когда в списке появились новые id (кроме первой загрузки). */
export function useNewItemsSignal(ids: string[] | null, onNew: () => void) {
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!ids) return;
    if (seen.current && ids.some((id) => !seen.current!.has(id))) onNew();
    seen.current = new Set(ids);
  }, [ids?.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
}
