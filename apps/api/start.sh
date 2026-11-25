#!/bin/sh
# Запуск API в контейнере (Render / docker compose): миграции → (демо-данные) → сервер.
set -e

# Отдельная схема в общей базе: DATABASE_SCHEMA=foodbuy → ?schema=foodbuy для Prisma
if [ -n "$DATABASE_SCHEMA" ]; then
  case "$DATABASE_URL" in
    *\?*) DATABASE_URL="$DATABASE_URL&schema=$DATABASE_SCHEMA" ;;
    *) DATABASE_URL="$DATABASE_URL?schema=$DATABASE_SCHEMA" ;;
  esac
  export DATABASE_URL
fi

cd /repo/packages/db
npx prisma migrate deploy

# Демо-ресторан при первом запуске (существующий не перезаписывается)
if [ "$SEED_DEMO" = "true" ]; then
  SEED_ONLY_IF_EMPTY=1 npx tsx prisma/seed.ts
fi

cd /repo/apps/api
exec node dist/main.js
