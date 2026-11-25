import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { LANG_COOKIE, messages, toLocale } from '@/lib/i18n';
import { StatusScreen } from '@/components/guest/StatusScreen';

export const metadata: Metadata = { title: 'QR-меню', robots: { index: false } };

/** Адрес ресторана без токена стола (ссылку обрезали или набрали вручную) — понятная подсказка вместо 404. */
export default async function RestaurantWithoutTable() {
  const [jar, hdrs] = await Promise.all([cookies(), headers()]);
  const browserLang = hdrs.get('accept-language')?.slice(0, 2) === 'ky' ? 'ky' : 'ru';
  const t = messages(toLocale(jar.get(LANG_COOKIE)?.value, browserLang));
  return <StatusScreen title={t.notFoundTitle} text={t.notFoundText} />;
}
