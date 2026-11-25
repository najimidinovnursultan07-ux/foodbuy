FROM node:22-alpine
RUN corepack enable
WORKDIR /repo
COPY . .
# postinstall собирает @qrmenu/shared и @qrmenu/db (Prisma-клиент под Alpine/musl)
RUN pnpm install --frozen-lockfile && pnpm --filter @qrmenu/api build
ENV NODE_ENV=production
EXPOSE 4000
# Миграции (и демо-данные при SEED_DEMO=true) применяются при старте контейнера
CMD ["sh", "/repo/apps/api/start.sh"]
