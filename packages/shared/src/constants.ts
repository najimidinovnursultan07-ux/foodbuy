export const TIMEZONE = 'Asia/Bishkek';
export const CURRENCY = 'KGS';
export const LOCALES = ['ru', 'ky', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';
