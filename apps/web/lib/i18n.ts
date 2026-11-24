import { LOCALES, type Locale } from '@qrmenu/shared';

/** Тексты интерфейса гостя. Кыргызские строки длиннее — вёрстка должна переносить. */
const ru = {
  table: 'Стол',
  language: 'Язык',
  hit: 'Хит',
  spicy: 'Острое',
  halal: 'Халяль',
  unavailable: 'Нет в наличии',
  upsellTitle: 'К этому берут',
  add: 'Добавить',
  added: 'Добавлено',
  comment: 'Комментарий к блюду',
  commentPlaceholder: 'Например: без лука',
  quantity: 'Количество',
  decrease: 'Меньше',
  increase: 'Больше',
  close: 'Закрыть',
  required: 'Обязательно',
  chooseUpTo: (n: number) => `до ${n}`,
  chooseOne: 'Выберите вариант',
  cart: 'Корзина',
  cartItems: (n: number) => `${n} ${plural(n, 'позиция', 'позиции', 'позиций')}`,
  menuOnly: 'Сейчас можно только посмотреть меню. Заказ — у официанта.',
  unit: { G: 'г', ML: 'мл', PCS: 'шт' },
  categories: 'Категории меню',
  notFoundTitle: 'Ссылка недействительна',
  notFoundText: 'Отсканируйте QR-код на столе ещё раз или позовите официанта.',
  disabledTitle: 'Меню временно недоступно',
  disabledText: 'Пожалуйста, обратитесь к официанту.',
  errorTitle: 'Не удалось загрузить меню',
  errorText: 'Проверьте интернет и обновите страницу.',
  retry: 'Обновить',
};

export type Messages = typeof ru;

const ky: Messages = {
  table: 'Үстөл',
  language: 'Тил',
  hit: 'Хит',
  spicy: 'Ачуу',
  halal: 'Халал',
  unavailable: 'Азыр жок',
  upsellTitle: 'Буга кошо алышат',
  add: 'Кошуу',
  added: 'Кошулду',
  comment: 'Тамакка комментарий',
  commentPlaceholder: 'Мисалы: пиязсыз',
  quantity: 'Саны',
  decrease: 'Азайтуу',
  increase: 'Көбөйтүү',
  close: 'Жабуу',
  required: 'Милдеттүү',
  chooseUpTo: (n) => `${n} чейин`,
  chooseOne: 'Вариантты тандаңыз',
  cart: 'Себет',
  cartItems: (n) => `${n} даана`,
  menuOnly: 'Азыр менюну гана көрүүгө болот. Заказды официантка бериңиз.',
  unit: { G: 'г', ML: 'мл', PCS: 'даана' },
  categories: 'Менюнун бөлүмдөрү',
  notFoundTitle: 'Шилтеме жараксыз',
  notFoundText: 'Үстөлдөгү QR-кодду кайра скандаңыз же официантты чакырыңыз.',
  disabledTitle: 'Меню убактылуу жеткиликсиз',
  disabledText: 'Сураныч, официантка кайрылыңыз.',
  errorTitle: 'Менюну жүктөө мүмкүн болбоду',
  errorText: 'Интернетти текшерип, баракты жаңылаңыз.',
  retry: 'Жаңылоо',
};

const en: Messages = {
  table: 'Table',
  language: 'Language',
  hit: 'Popular',
  spicy: 'Spicy',
  halal: 'Halal',
  unavailable: 'Unavailable',
  upsellTitle: 'Goes well with',
  add: 'Add',
  added: 'Added',
  comment: 'Note for the kitchen',
  commentPlaceholder: 'E.g. no onion',
  quantity: 'Quantity',
  decrease: 'Less',
  increase: 'More',
  close: 'Close',
  required: 'Required',
  chooseUpTo: (n) => `up to ${n}`,
  chooseOne: 'Choose an option',
  cart: 'Cart',
  cartItems: (n) => `${n} ${n === 1 ? 'item' : 'items'}`,
  menuOnly: 'The menu is view-only right now. Please order with your waiter.',
  unit: { G: 'g', ML: 'ml', PCS: 'pcs' },
  categories: 'Menu categories',
  notFoundTitle: 'This link is not valid',
  notFoundText: 'Please scan the QR code on your table again or call a waiter.',
  disabledTitle: 'Menu is temporarily unavailable',
  disabledText: 'Please ask your waiter.',
  errorTitle: 'Could not load the menu',
  errorText: 'Check your connection and refresh the page.',
  retry: 'Refresh',
};

const MESSAGES: Record<Locale, Messages> = { ru, ky, en };

export const LOCALE_LABELS: Record<Locale, string> = { ru: 'RU', ky: 'KY', en: 'EN' };

export function messages(locale: Locale): Messages {
  return MESSAGES[locale];
}

export function toLocale(value: string | undefined | null, fallback: Locale = 'ru'): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : fallback;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const LANG_COOKIE = 'lang';
