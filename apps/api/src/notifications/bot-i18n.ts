import { formatSom, pickText, type Locale, type ReportDto } from '@qrmenu/shared';

/** Тексты Telegram-бота владельцу — на языке ресторана по умолчанию. */
const ru = {
  linked: (name: string) => `✅ Готово! Этот чат подключён к ресторану «${name}». Сюда будут приходить вечерний отчёт и важные алерты.`,
  badCode: '⚠️ Ссылка устарела или уже использована. Откройте панель ресторана → Настройки → Telegram и нажмите «Подключить» ещё раз.',
  help: 'Это бот QR-меню для владельцев ресторанов. Чтобы подключить уведомления, откройте панель ресторана → Настройки → Telegram → «Подключить».',
  unlinked: 'Уведомления отключены. Подключить снова можно в панели ресторана.',
  test: (name: string) => `🔔 Проверка: уведомления ресторана «${name}» приходят в этот чат.`,
  lateOrder: (n: number, table: string, min: number, pending: boolean) =>
    `⏰ Заказ №${n}, стол ${table} ждёт ${min} мин${pending ? ' — ещё не подтверждён официантом' : ''}.`,
  badReview: (rating: number, table: string, comment: string | null) =>
    `😟 Отзыв ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} (стол ${table})${comment ? `\n«${comment}»` : '\nБез комментария.'}`,
  stopOff: (names: string) => `⛔ В стоп-листе: ${names}`,
  stopOn: (names: string) => `✅ Снова в наличии: ${names}`,
  report: (name: string, date: string, r: ReportDto, locale: Locale) =>
    [
      `📊 «${name}», ${date}`,
      `Выручка: ${formatSom(r.revenueTyiyn)}`,
      `Чеков: ${r.billsCount} · средний чек ${formatSom(r.avgCheckTyiyn)}`,
      `Наличные: ${formatSom(r.cashTyiyn)} · карта: ${formatSom(r.cardTyiyn)}`,
      `Заказов: ${r.ordersCount}`,
      r.topDishes.length ? `Топ: ${r.topDishes.slice(0, 3).map((d) => `${pickText(d.name, locale)} ×${d.quantity}`).join(', ')}` : '',
      r.reviews.count ? `Отзывы: ${r.reviews.count}, средняя ${r.reviews.avgRating}★${r.reviews.lowCount ? `, плохих: ${r.reviews.lowCount}` : ''}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
};

export type BotMessages = typeof ru;

const ky: BotMessages = {
  linked: (name) => `✅ Даяр! Бул чат «${name}» ресторанына туташты. Бул жерге кечки отчёт жана маанилүү билдирүүлөр келет.`,
  badCode: '⚠️ Шилтеменин мөөнөтү бүттү же колдонулган. Ресторандын панелин ачыңыз → Жөндөөлөр → Telegram жана «Туташтыруу» баскычын кайра басыңыз.',
  help: 'Бул ресторан ээлери үчүн QR-меню боту. Билдирмелерди туташтыруу үчүн ресторандын панелин ачыңыз → Жөндөөлөр → Telegram → «Туташтыруу».',
  unlinked: 'Билдирмелер өчүрүлдү. Кайра туташтырууну ресторандын панелинен жасаса болот.',
  test: (name) => `🔔 Текшерүү: «${name}» ресторанынын билдирмелери ушул чатка келет.`,
  lateOrder: (n, table, min, pending) =>
    `⏰ №${n} заказ, ${table}-үстөл ${min} мүнөт күтүп жатат${pending ? ' — официант али ырастай элек' : ''}.`,
  badReview: (rating, table, comment) =>
    `😟 Пикир ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} (${table}-үстөл)${comment ? `\n«${comment}»` : '\nКомментарийсиз.'}`,
  stopOff: (names) => `⛔ Стоп-тизмеде: ${names}`,
  stopOn: (names) => `✅ Кайра бар: ${names}`,
  report: (name, date, r, locale) =>
    [
      `📊 «${name}», ${date}`,
      `Түшүм: ${formatSom(r.revenueTyiyn)}`,
      `Чектер: ${r.billsCount} · орточо чек ${formatSom(r.avgCheckTyiyn)}`,
      `Накталай: ${formatSom(r.cashTyiyn)} · карта: ${formatSom(r.cardTyiyn)}`,
      `Заказдар: ${r.ordersCount}`,
      r.topDishes.length ? `Эң көп: ${r.topDishes.slice(0, 3).map((d) => `${pickText(d.name, locale)} ×${d.quantity}`).join(', ')}` : '',
      r.reviews.count ? `Пикирлер: ${r.reviews.count}, орточо ${r.reviews.avgRating}★${r.reviews.lowCount ? `, начар: ${r.reviews.lowCount}` : ''}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
};

const en: BotMessages = {
  linked: (name) => `✅ Done! This chat is now connected to “${name}”. The evening report and important alerts will arrive here.`,
  badCode: '⚠️ This link has expired or was already used. Open the restaurant dashboard → Settings → Telegram and press “Connect” again.',
  help: 'This is the QR-menu bot for restaurant owners. To connect notifications, open the restaurant dashboard → Settings → Telegram → “Connect”.',
  unlinked: 'Notifications are off. You can reconnect from the restaurant dashboard.',
  test: (name) => `🔔 Test: notifications for “${name}” arrive in this chat.`,
  lateOrder: (n, table, min, pending) => `⏰ Order #${n}, table ${table} has been waiting ${min} min${pending ? ' — not yet confirmed by a waiter' : ''}.`,
  badReview: (rating, table, comment) =>
    `😟 Review ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} (table ${table})${comment ? `\n“${comment}”` : '\nNo comment.'}`,
  stopOff: (names) => `⛔ Out of stock: ${names}`,
  stopOn: (names) => `✅ Back in stock: ${names}`,
  report: (name, date, r, locale) =>
    [
      `📊 “${name}”, ${date}`,
      `Revenue: ${formatSom(r.revenueTyiyn)}`,
      `Bills: ${r.billsCount} · average ${formatSom(r.avgCheckTyiyn)}`,
      `Cash: ${formatSom(r.cashTyiyn)} · card: ${formatSom(r.cardTyiyn)}`,
      `Orders: ${r.ordersCount}`,
      r.topDishes.length ? `Top: ${r.topDishes.slice(0, 3).map((d) => `${pickText(d.name, locale)} ×${d.quantity}`).join(', ')}` : '',
      r.reviews.count ? `Reviews: ${r.reviews.count}, average ${r.reviews.avgRating}★${r.reviews.lowCount ? `, low: ${r.reviews.lowCount}` : ''}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
};

const ALL: Record<Locale, BotMessages> = { ru, ky, en };
export const botMessages = (locale: string): BotMessages => ALL[(locale as Locale) in ALL ? (locale as Locale) : 'ru'];
