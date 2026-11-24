'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminContext, useAdminSetup } from '@/lib/admin-api';
import { LangSwitch } from '@/components/staff/StaffHeader';
import s from './admin.module.css';

const NAV = ['menu', 'stop', 'tables', 'staff', 'settings', 'reports'] as const;
const HREF: Record<(typeof NAV)[number], string> = {
  menu: '/admin/menu',
  stop: '/admin/stop-list',
  tables: '/admin/tables',
  staff: '/admin/staff',
  settings: '/admin/settings',
  reports: '/admin/reports',
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const ctx = useAdminSetup();
  const path = usePathname();
  if (!ctx) return <p className={s.loading}>…</p>;
  const { t, session, locale, setLocale, logout } = ctx;

  return (
    <AdminContext.Provider value={ctx}>
      <div className={s.shell}>
        <header className={s.top}>
          <div className={s.brand}>
            <strong>{session.staff.restaurant.name}</strong>
            <span>
              {t.panel} · {session.staff.name}
            </span>
          </div>
          <div className={s.topTools}>
            <Link href="/staff/waiter" className={s.topLink}>
              {t.floor}
            </Link>
            <Link href="/staff/kitchen" className={s.topLink}>
              {t.kitchen}
            </Link>
            <LangSwitch locale={locale} onChange={setLocale} label={t.language} />
            <button type="button" className={s.btn} onClick={logout}>
              {t.logout}
            </button>
          </div>
        </header>
        <nav className={s.nav} aria-label={t.panel}>
          {NAV.map((k) => (
            <Link key={k} href={HREF[k]} className={s.navLink} aria-current={path === HREF[k] ? 'page' : undefined}>
              {t.nav[k]}
            </Link>
          ))}
        </nav>
        <main className={s.main}>{children}</main>
      </div>
    </AdminContext.Provider>
  );
}
