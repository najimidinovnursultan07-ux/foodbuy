import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { fetchMenu } from '@/lib/api';
import { LANG_COOKIE, messages, toLocale } from '@/lib/i18n';
import { GuestMenu } from '@/components/guest/GuestMenu';
import { StatusScreen } from '@/components/guest/StatusScreen';

type Params = Promise<{ slug: string; token: string }>;

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, token } = await params;
  const res = await fetchMenu(slug, token);
  return {
    title: res.kind === 'ok' ? `${res.menu.restaurant.name} — меню` : 'QR-меню',
    robots: { index: false }, // ссылки столов не индексируем
  };
}

export default async function GuestMenuPage({ params }: { params: Params }) {
  const { slug, token } = await params;
  const [res, jar, hdrs] = await Promise.all([fetchMenu(slug, token), cookies(), headers()]);

  // Без меню язык ресторана неизвестен: русский, если браузер не на кыргызском
  const browserLang = hdrs.get('accept-language')?.slice(0, 2) === 'ky' ? 'ky' : 'ru';
  const fallback = toLocale(res.kind === 'ok' ? res.menu.restaurant.defaultLocale : browserLang);
  const locale = toLocale(jar.get(LANG_COOKIE)?.value, fallback);
  const t = messages(locale);

  if (res.kind === 'not_found') return <StatusScreen title={t.notFoundTitle} text={t.notFoundText} />;
  if (res.kind === 'disabled') return <StatusScreen title={t.disabledTitle} text={t.disabledText} />;
  if (res.kind === 'error') return <StatusScreen title={t.errorTitle} text={t.errorText} retry={t.retry} />;

  return <GuestMenu menu={res.menu} token={token} initialLocale={locale} />;
}
