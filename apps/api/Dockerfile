FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @qrmenu/api... build

FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 4000
# Миграции применяются при старте контейнера
CMD ["sh", "-c", "cd /repo/packages/db && npx prisma migrate deploy && cd /repo/apps/api && node dist/main.js"]
