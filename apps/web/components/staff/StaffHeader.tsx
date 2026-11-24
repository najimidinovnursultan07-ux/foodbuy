'use client';

import Link from 'next/link';
import type { Locale, StaffProfileDto } from '@qrmenu/shared';
import { LOCALE_LABELS } from '@/lib/i18n';
import type { StaffMessages } from '@/lib/staff-i18n';
import s from './staff.module.css';

export function LangSwitch({ locale, onChange, label }: { locale: Locale; onChange: (l: Locale) => void; label: string }) {
  return (
    <div className={s.langs} role="group" aria-label={label}>
      {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
        <button key={l} type="button" lang={l} className={s.langBtn} aria-pressed={l === locale} onClick={() => onChange(l)}>
          {LOCALE_LABELS[l]}
        </button>
      ))}
    </div>
  );
}

interface Props {
  staff: StaffProfileDto | undefined;
  t: StaffMessages;
  locale: Locale;
  onLocale: (l: Locale) => void;
  sound: { enabled: boolean; enable: () => void };
  offline: boolean;
  onLogout: () => void;
  children?: React.ReactNode;
}

export function StaffHeader({ staff, t, locale, onLocale, sound, offline, onLogout, children }: Props) {
  return (
    <header className={s.header}>
      <div className={s.who}>
        <strong>{staff?.restaurant.name}</strong>
        <span>{staff?.name}</span>
      </div>
      {children}
      <div className={s.headerTools}>
        {offline && (
          <span className={s.offline} role="status">
            ⚠︎ offline
          </span>
        )}
        {staff?.role === 'manager' && (
          <nav className={s.nav}>
            <Link href="/staff/waiter">{t.floor}</Link>
            <Link href="/staff/kitchen">{t.kitchen}</Link>
          </nav>
        )}
        <button type="button" className={s.toolBtn} onClick={sound.enable} aria-pressed={sound.enabled}>
          {sound.enabled ? t.soundIsOn : t.soundOn}
        </button>
        <LangSwitch locale={locale} onChange={onLocale} label={t.language} />
        <button type="button" className={s.toolBtn} onClick={onLogout}>
          {t.logout}
        </button>
      </div>
    </header>
  );
}
