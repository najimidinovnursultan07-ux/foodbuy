'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale, StaffLoginResponse } from '@qrmenu/shared';
import { API_URL } from './guest-api';
import { StaffApiError, clearSession, loadSession, staffFetch, useStaffLocale } from './staff-api';
import { adminMessages, type AdminMessages } from './admin-i18n';

export interface AdminApi {
  get<T>(path: string): Promise<T>;
  send<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T>;
  upload<T>(path: string, file: File): Promise<T>;
  download(path: string, filename: string): Promise<void>;
}

export interface AdminCtx {
  session: StaffLoginResponse;
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: AdminMessages;
  api: AdminApi;
  /** Текст ошибки для пользователя по коду API */
  errorText: (e: unknown) => string;
  logout: () => void;
}

export const AdminContext = createContext<AdminCtx | null>(null);
export const useAdmin = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin вне AdminShell');
  return ctx;
};

/** Сессия менеджера: без неё или с другой ролью — на вход. */
export function useAdminSetup(): AdminCtx | null {
  const router = useRouter();
  const [session, setSession] = useState<StaffLoginResponse | null>(null);
  const [locale, setLocale] = useStaffLocale();
  const t = adminMessages(locale);

  const logout = useCallback(() => {
    clearSession();
    router.replace('/staff');
  }, [router]);

  useEffect(() => {
    const s = loadSession();
    if (!s || s.staff.role !== 'manager') router.replace('/staff');
    else setSession(s);
  }, [router]);

  const api = useMemo<AdminApi | null>(() => {
    if (!session) return null;
    const token = session.token;
    const guard = <T,>(p: Promise<T>) =>
      p.catch((e: unknown) => {
        if (e instanceof StaffApiError && (e.status === 401 || e.status === 403)) logout();
        throw e;
      });
    const raw = async (path: string, init: RequestInit) => {
      let res: Response;
      try {
        res = await fetch(`${API_URL}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
      } catch {
        throw new StaffApiError(0, 'NETWORK');
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { code?: string } | null;
        throw new StaffApiError(res.status, body?.code ?? 'UNKNOWN');
      }
      return res;
    };
    return {
      get: (path) => guard(staffFetch(path, token)),
      send: (method, path, body) =>
        guard(staffFetch(path, token, { method, body: body === undefined ? undefined : JSON.stringify(body) })),
      upload: (path, file) => {
        const form = new FormData();
        form.append('file', file);
        return guard(raw(path, { method: 'POST', body: form }).then((r) => r.json()));
      },
      download: (path, filename) =>
        guard(
          raw(path, { method: 'GET' }).then(async (r) => {
            const url = URL.createObjectURL(await r.blob());
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
          }),
        ),
    };
  }, [session, logout]);

  const errorText = useCallback(
    (e: unknown) => (e instanceof StaffApiError && t.err[e.code]) || t.err.generic!,
    [t],
  );

  if (!session || !api) return null;
  return { session, locale, setLocale, t, api, errorText, logout };
}

/** Загрузка данных страницы панели с перезагрузкой после изменений. */
export function useAdminData<T>(path: string) {
  const { api, errorText } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await api.get<T>(path));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [api, path, errorText]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload, setData };
}
