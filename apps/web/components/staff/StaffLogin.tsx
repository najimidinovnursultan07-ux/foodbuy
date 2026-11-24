'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { StaffLoginResponse } from '@qrmenu/shared';
import { StaffApiError, homeFor, loadSession, saveSession, staffFetch, useStaffLocale } from '@/lib/staff-api';
import { staffMessages } from '@/lib/staff-i18n';
import { LangSwitch } from './StaffHeader';
import s from './staff.module.css';

export function StaffLogin() {
  const router = useRouter();
  const [locale, setLocale] = useStaffLocale();
  const t = staffMessages(locale);
  const [phone, setPhone] = useState('+996 ');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = loadSession();
    if (existing) router.replace(homeFor(existing.staff));
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await staffFetch<StaffLoginResponse>('/staff/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ phone, pin }),
      });
      saveSession(res);
      router.replace(homeFor(res.staff));
    } catch (err) {
      const code = err instanceof StaffApiError ? err.code : '';
      setError(
        code === 'INVALID_CREDENTIALS' || code === 'INVALID_REQUEST'
          ? t.errInvalid
          : code === 'RATE_LIMITED'
            ? t.errLocked
            : code === 'MULTIPLE_RESTAURANTS'
              ? t.errMultiple
              : t.errGeneric,
      );
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
          <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        <label>
          {t.pin}
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            pattern="\d{4,6}"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            required
          />
        </label>
        {error && (
          <p className={s.formError} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={s.primaryBtn} disabled={busy}>
          {busy ? t.signingIn : t.signIn}
        </button>
      </form>
    </main>
  );
}
