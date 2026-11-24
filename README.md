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
pnpm install
pnpm --filter @qrmenu/shared build
pnpm db:deploy && pnpm db:seed
pnpm dev                      # api :4000, web :3000
pnpm test
```
Всё целиком в Docker: `docker compose --profile app up --build`.

## Демо-доступы (сиды)
Ресторан `ala-too-demo`. Телефон / PIN:
- менеджер +996700000001 / 1234
- официант +996700000002 / 1111
- кухня +996700000003 / 2222
- бар +996700000004 / 3333
