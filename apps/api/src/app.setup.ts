import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { LOCAL_UPLOAD_DIR } from './storage/storage.service';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

/** Общая настройка приложения — для main.ts и тестов. */
export function configureApp(app: INestApplication): INestApplication {
  const origin = process.env.WEB_ORIGIN?.split(',') ?? true;
  app.enableCors({ origin, credentials: true });
  app.useWebSocketAdapter(new RedisIoAdapter(app, process.env.REDIS_URL ?? 'redis://localhost:6379', origin));
  if (process.env.STORAGE_DRIVER !== 's3') {
    // Локальные загрузки (разработка без S3): имена файлов уникальны — кешируем навсегда
    (app as NestExpressApplication).useStaticAssets(LOCAL_UPLOAD_DIR, { prefix: '/uploads/', maxAge: '365d', immutable: true });
  }
  app.enableShutdownHooks();
  return app;
}
