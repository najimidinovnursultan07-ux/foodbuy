import { TIMEZONE } from './constants';

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Часы работы по Бишкеку: { mon: [["10:00","23:00"]], sat: [["12:00","02:00"]] }.
 * Интервал, у которого конец ≤ начала, идёт через полночь. День без ключа или с [] — выходной.
 * Пустой объект — часы не заданы, ресторан считается открытым всегда.
 */
export type OpeningHours = Partial<Record<Weekday, [string, string][]>>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function isValidHours(h: unknown): h is OpeningHours {
  if (typeof h !== 'object' || h === null || Array.isArray(h)) return false;
  return Object.entries(h).every(
    ([day, list]) =>
      (WEEKDAYS as readonly string[]).includes(day) &&
      Array.isArray(list) &&
      list.length <= 4 &&
      list.every((iv) => Array.isArray(iv) && iv.length === 2 && TIME.test(iv[0]) && TIME.test(iv[1]) && iv[0] !== iv[1]),
  );
}

function bishkekParts(d: Date): { day: Weekday; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const day = get('weekday').toLowerCase().slice(0, 3) as Weekday;
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export function isOpenAt(hours: OpeningHours | null | undefined, at: Date = new Date()): boolean {
  if (!hours || Object.keys(hours).length === 0) return true;
  const { day, minutes } = bishkekParts(at);
  const idx = WEEKDAYS.indexOf(day);
  const yesterday = WEEKDAYS[(idx + 6) % 7]!;
  for (const [s, e] of hours[day] ?? []) {
    const [a, b] = [toMin(s), toMin(e)];
    if (b > a ? minutes >= a && minutes < b : minutes >= a) return true;
  }
  for (const [s, e] of hours[yesterday] ?? []) {
    const [a, b] = [toMin(s), toMin(e)];
    if (b <= a && minutes < b) return true; // хвост вчерашней ночной смены
  }
  return false;
}
