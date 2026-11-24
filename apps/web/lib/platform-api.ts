'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlatformLoginResponse } from '@qrmenu/shared';
import { StaffApiError, staffFetch, useStaffLocale } from './staff-api';
import { platformMessages } from './platform-i18n';

/** Сессия платформы хранится отдельно от сессии персонала ресторана. */
const KEY = 'qrmenu:platform';

export const savePlatformSession = (s: PlatformLoginResponse) => localStorage.setItem(KEY, JSON.stringify(s));
export function loadPlatformSession(): PlatformLoginResponse | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as PlatformLoginResponse | null;
  } catch {
    return null;
  }
}

export function usePlatform() {
  const router = useRouter();
  const [session, setSession] = useState<PlatformLoginResponse | null>(null);
  const [locale, setLocale] = useStaffLocale();
  const t = platformMessages(locale);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    router.replace('/platform');
  }, [router]);

  useEffect(() => {
    const s = loadPlatformSession();
    if (!s) router.replace('/platform');
    else setSession(s);
  }, [router]);

  const api = useMemo(() => {
    const token = session?.token ?? null;
    const guard = <T,>(p: Promise<T>) =>
      p.catch((e: unknown) => {
        if (e instanceof StaffApiError && e.status === 401) logout();
        throw e;
      });
    return {
      get: <T,>(path: string) => guard(staffFetch<T>(path, token)),
      send: <T,>(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown) =>
        guard(staffFetch<T>(path, token, { method, body: JSON.stringify(body) })),
    };
  }, [session, logout]);

  const errorText = useCallback((e: unknown) => (e instanceof StaffApiError && t.err[e.code]) || t.err.generic!, [t]);
  return { session, locale, setLocale, t, api, errorText, logout };
}
