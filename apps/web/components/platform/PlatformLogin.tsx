'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { PlatformLoginResponse } from '@qrmenu/shared';
import { StaffApiError, staffFetch, useStaffLocale } from '@/lib/staff-api';
import { loadPlatformSession, savePlatformSession } from '@/lib/platform-api';
import { platformMessages } from '@/lib/platform-i18n';
import { LangSwitch } from '@/components/staff/StaffHeader';
import s from '@/components/staff/staff.module.css';

export function PlatformLogin() {
  const router = useRouter();
  const [locale, setLocale] = useStaffLocale();
  const t = platformMessages(locale);
  const [phone, setPhone] = useState('+996 ');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loadPlatformSession()) router.replace('/platform/restaurants');
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      savePlatformSession(await staffFetch<PlatformLoginResponse>('/platform/auth/login', null, { method: 'POST', body: JSON.stringify({ phone, pin }) }));
      router.replace('/platform/restaurants');
    } catch (err) {
      const code = err instanceof StaffApiError ? err.code : '';
      setError(t.err[code === 'INVALID_REQUEST' ? 'INVALID_CREDENTIALS' : code] ?? t.err.generic!);
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`${s.light} ${s.loginPage}`}>
      <div className={s.loginTop}>
        <LangSwitch locale={locale} onChange={setLocale} label={t.language} />
      </div>
      <form className={s.loginForm} onSubmit={submit}>
        <h1>{t.loginTitle}</h1>
        <label>
          {t.phone}
          <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label>
          {t.pin}
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            required
          />
        </label>
        {error && <p className={s.formError}>{error}</p>}
        <button type="submit" className={s.primaryBtn} disabled={busy}>
          {t.signIn}
        </button>
      </form>
    </main>
  );
}
