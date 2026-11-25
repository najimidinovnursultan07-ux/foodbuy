/**
 * Роль процесса — один и тот же код запускается по-разному:
 *  - api    — только HTTP/WebSocket (Vercel Functions): задачи кладёт в очередь, но не выполняет,
 *             Telegram не опрашивает — функции засыпают между запросами;
 *  - worker — только фоновая работа (Vercel Daemon): обработчик очереди BullMQ, расписание
 *             (опоздавшие заказы, вечерний отчёт) и опрос Telegram; HTTP не слушает;
 *  - all    — всё вместе в одном процессе (локальный запуск, docker compose).
 * По умолчанию на Vercel — api, в остальных местах — all. Точка входа worker.ts задаёт worker сама.
 */
export type AppRole = 'api' | 'worker' | 'all';

export function appRole(): AppRole {
  const r = process.env.APP_ROLE;
  if (r === 'api' || r === 'worker' || r === 'all') return r;
  return process.env.VERCEL ? 'api' : 'all';
}

/** Выполнять фоновые задачи (очередь, расписание, опрос Telegram) в этом процессе. */
export const runsBackgroundWork = () => appRole() !== 'api';
