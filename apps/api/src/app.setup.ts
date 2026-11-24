import type { INestApplication } from '@nestjs/common';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

/** Общая настройка приложения — для main.ts и тестов. */
export function configureApp(app: INestApplication): INestApplication {
  const origin = process.env.WEB_ORIGIN?.split(',') ?? true;
  app.enableCors({ origin, credentials: true });
  app.useWebSocketAdapter(new RedisIoAdapter(app, process.env.REDIS_URL ?? 'redis://localhost:6379', origin));
  app.enableShutdownHooks();
  return app;
}
