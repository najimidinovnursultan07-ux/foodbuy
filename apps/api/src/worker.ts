import 'reflect-metadata';
// Роль задаём до загрузки модулей: сервисы читают её при инициализации
process.env.APP_ROLE = 'worker';

import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { NotificationsModule } from './notifications/notifications.module';

/** Только то, что нужно фоновой работе: БД, Redis, уведомления (очередь, расписание, бот). */
@Module({ imports: [PrismaModule, RedisModule, NotificationsModule] })
class WorkerModule {}

/**
 * Фоновый процесс (Vercel Daemon / отдельный контейнер): HTTP не слушает, берёт работу
 * из очереди BullMQ и опрашивает Telegram. На SIGTERM дожидается текущих задач и выходит.
 */
async function bootstrap() {
  const log = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  log.log('Фоновый обработчик запущен: очередь уведомлений, расписание, Telegram');
}
void bootstrap();
