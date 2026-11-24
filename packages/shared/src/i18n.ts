import { DEFAULT_LOCALE, type Locale } from './constants';

/** Переводимый текст в БД: { ru, ky?, en? }. ru — обязателен. */
export type LocalizedText = { ru: string } & Partial<Record<Exclude<Locale, 'ru'>, string>>;

/** Берём перевод, при отсутствии — русский вариант. */
export function pickText(text: LocalizedText | null | undefined, locale: Locale): string {
  if (!text) return '';
  return text[locale]?.trim() || text[DEFAULT_LOCALE] || '';
}
