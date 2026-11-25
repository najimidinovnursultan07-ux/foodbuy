# QR-меню

The product description and rules are in [CLAUDE.md](CLAUDE.md).

## Структура
```
apps/api         NestJS: REST + WebSocket
apps/web         Next.js (App Router), PWA: гость, официант, кухня, панель
packages/db      Prisma-схема, миграции, сиды, PrismaClient
packages/shared  Общий код: деньги (тыйыны → «1 250 сом»), i18n, подпись QR, PIN
```

## Запуск
```bash
cp .env.example .env
docker compose up -d          # postgres, redis, minio
pnpm install                  # заодно собирает общие пакеты и Prisma-клиент
pnpm db:deploy && pnpm db:seed
pnpm dev                      # api :4000, web :3000
pnpm test                     # unit + интеграционные (Vitest)
pnpm build && pnpm --filter @qrmenu/web test:e2e   # путь гостя (Playwright)
```

`pnpm db:seed` печатает ссылки столов вида `http://localhost:3000/m/ala-too-demo/<токен>` — это то, что будет в QR.
Всё целиком в Docker: `docker compose --profile app up --build`.

## Экраны
- Гость: `/m/<slug>/<токен стола>` (ссылку печатает `pnpm db:seed`)
- Персонал: `/staff` — вход по телефону и PIN, дальше по роли:
  `/staff/waiter` (лента официанта, телефон), `/staff/kitchen` (экран кухни/бара, планшет)
- Панель ресторана (менеджер): `/admin` — меню и фото, стоп-лист, столы и печать QR (PDF), сотрудники, настройки, отчёты
- Супер-админка платформы: `/platform` — рестораны, ручная подписка, тарифы, режим «только меню» / отключение

## Фото и файлы
`STORAGE_DRIVER=local` — фото кладутся в `apps/api/uploads` и раздаются API по `/uploads` (разработка без Docker).
`STORAGE_DRIVER=s3` — S3-совместимое хранилище (в `docker compose` это MinIO). Фото блюд сжимаются в WebP: 960×720 и миниатюра 176×176.

## Демо-доступы (сиды)
Ресторан `ala-too-demo`. Телефон / PIN:
- менеджер +996700000001 / 1234
- официант +996700000002 / 1111
- кухня +996700000003 / 2222
- бар +996700000004 / 3333
- супер-админка (`/platform`) +996700000099 / 999999 — только для разработки

## Telegram-бот владельцу
1. Создайте бота у @BotFather, впишите в `.env` `TELEGRAM_BOT_TOKEN` и `TELEGRAM_BOT_USERNAME`.
2. Менеджер: Панель → Настройки → Telegram → «Подключить» → открыть ссылку в Telegram и нажать «Старт».
3. Приходят: вечерний отчёт (час выбирается в настройках), заказ ждёт дольше нормы, отзыв 1–3★, изменения стоп-листа.

По умолчанию бот получает сообщения опросом (long polling). Для вебхука задайте `TELEGRAM_WEBHOOK_SECRET`
и зарегистрируйте `https://<api>/telegram/webhook` через `setWebhook` с этим `secret_token`.
Отправка идёт через очередь BullMQ (Redis) с повторами.

## Деплой (продакшен)
- **API + Redis — Render**, описаны в `render.yaml` (Blueprint, автодеплой из `main`).
  API: https://foodbuy-api-b3hj.onrender.com (проверка: `/health`). Один процесс: HTTP, Socket.IO,
  очередь уведомлений, расписание и Telegram. При старте `apps/api/start.sh` применяет миграции
  и (при `SEED_DEMO=true`) один раз создаёт демо-ресторан.
- **База** — схема `foodbuy` в Postgres `autokg` на Render (`DATABASE_SCHEMA=foodbuy`).
  ⚠️ Бесплатная база Render удаляется через 30 дней (у `autokg` — 18.12.2026). До этого перенесите
  данные в платную базу и поменяйте `DATABASE_URL`.
- **Сайт — Vercel** (`vercel.json`, сервис `web`). Адрес API для браузера — в `apps/web/.env.production`.
- **Секреты** не хранятся в репозитории: `QR_SIGNING_SECRET` и `JWT_SECRET` сгенерировал Render,
  PIN демо-сотрудников и супер-админки в продакшене — из `SEED_PIN` (PIN из этого README там не работают).
- Переменные API на Render, которые стоит добавить: `PUBLIC_WEB_URL` (адрес сайта — для ссылок в QR),
  `WEB_ORIGIN` (тот же адрес — ограничить CORS), `TELEGRAM_BOT_TOKEN` и `TELEGRAM_BOT_USERNAME`.
- Бесплатный тариф: сервер засыпает после 15 минут без запросов (первое открытие ~1 минута),
  во сне не работают расписание и Telegram; диск не сохраняется — для фото блюд нужен S3
  (`STORAGE_DRIVER=s3` и `S3_*`).

