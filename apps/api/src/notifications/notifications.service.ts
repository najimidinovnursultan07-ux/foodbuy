import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, UnrecoverableError, Worker, type ConnectionOptions, type Job } from 'bullmq';
import Redis from 'ioredis';
import type { Restaurant } from '@qrmenu/db';
import { bishkekDate, type Locale } from '@qrmenu/shared';
import { PrismaService } from '../prisma/prisma.module';
import { REDIS } from '../redis/redis.module';
import { AdminReportsService } from '../admin/admin-reports.service';
import { TelegramClient, TelegramError } from './telegram.client';
import { runsBackgroundWork } from '../config/role';
import { botMessages, type BotMessages } from './bot-i18n';

type SendJob = { chatId: string; text: string };

const LATE_ORDER_HORIZON_MS = 12 * 3600_000;

/**
 * Уведомления владельцу в Telegram. Отправка идёт через очередь BullMQ (повторы с паузой,
 * если Telegram недоступен). По расписанию: проверка «заказ ждёт дольше нормы» раз в минуту
 * и вечерний отчёт в выбранный час (по Бишкеку). Повторные алерты отсекаются ключами в Redis.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NotificationsService.name);
  private readonly redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  private readonly prefix = process.env.QUEUE_PREFIX ?? 'qrmenu';
  private queue!: Queue;
  private worker!: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: AdminReportsService,
    private readonly telegram: TelegramClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Параметры подключения из REDIS_URL; соединения создаёт и закрывает сам BullMQ. */
  private connection(): ConnectionOptions {
    const u = new URL(this.redisUrl);
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      username: u.username || undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
      db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
      tls: u.protocol === 'rediss:' ? {} : undefined,
      maxRetriesPerRequest: null,
    };
  }

  async onModuleInit() {
    // Очередь нужна всем: API кладёт в неё сообщения
    this.queue = new Queue('notifications', { connection: this.connection(), prefix: this.prefix });
    // Обработчик и расписание — только там, где процесс живёт постоянно (worker или локально all)
    if (!runsBackgroundWork()) return;
    this.worker = new Worker('notifications', (job) => this.process(job), {
      connection: this.connection(),
      prefix: this.prefix,
      concurrency: 5,
    });
    this.worker.on('failed', (job, e) => this.log.warn(`Задача ${job?.name} не выполнена: ${e.message}`));

    if (process.env.NOTIFICATIONS_SCHEDULER !== 'off') {
      await this.queue.upsertJobScheduler('late-orders', { every: 60_000 }, { name: 'late-orders' });
      await this.queue.upsertJobScheduler('evening-report', { pattern: '0 * * * *', tz: 'Asia/Bishkek' }, { name: 'evening-report' });
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  private async process(job: Job) {
    if (job.name === 'send') {
      const { chatId, text } = job.data as SendJob;
      try {
        await this.telegram.sendMessage(chatId, text);
      } catch (e) {
        // 400/403: чат удалён или бот заблокирован — повторять бессмысленно
        if (e instanceof TelegramError && (e.status === 400 || e.status === 403)) throw new UnrecoverableError(e.message);
        throw e;
      }
    } else if (job.name === 'late-orders') await this.checkLateOrders();
    else if (job.name === 'evening-report') await this.sendEveningReports();
  }

  private async enqueue(chatId: string, text: string) {
    await this.queue.add('send', { chatId, text } satisfies SendJob, {
      attempts: 6,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  }

  /** Сообщение владельцу, если Telegram подключён. */
  async notifyOwner(restaurantId: string, render: (m: BotMessages, r: Restaurant) => string): Promise<boolean> {
    if (!this.telegram.enabled) return false;
    const r = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!r?.telegramChatId) return false;
    await this.enqueue(r.telegramChatId, render(botMessages(r.defaultLocale), r));
    return true;
  }

  // ───────── Алерты ─────────

  notifyBadReview(restaurantId: string, rating: number, tableLabel: string, comment: string | null) {
    return this.notifyOwner(restaurantId, (m) => m.badReview(rating, tableLabel, comment));
  }

  notifyStopList(restaurantId: string, names: string[], available: boolean) {
    if (!names.length) return Promise.resolve(false);
    return this.notifyOwner(restaurantId, (m) => (available ? m.stopOn : m.stopOff)(names.join(', ')));
  }

  /** Заказы, которые ждут дольше нормы ресторана. Каждый заказ — один алерт. */
  async checkLateOrders(now = new Date()): Promise<number> {
    if (!this.telegram.enabled) return 0;
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: ['PENDING_CONFIRMATION', 'NEW', 'IN_PROGRESS'] },
        createdAt: { gte: new Date(now.getTime() - LATE_ORDER_HORIZON_MS) },
        restaurant: { telegramChatId: { not: null }, status: { not: 'DISABLED' } },
      },
      include: { restaurant: true, table: { select: { label: true } } },
    });
    let sent = 0;
    for (const o of orders) {
      const since = (o.confirmedAt ?? o.createdAt).getTime();
      const minutes = Math.floor((now.getTime() - since) / 60_000);
      if (minutes < o.restaurant.orderAlertMinutes) continue;
      if ((await this.redis.set(`tg:late:${o.id}`, '1', 'EX', 86_400, 'NX')) !== 'OK') continue;
      const m = botMessages(o.restaurant.defaultLocale);
      await this.enqueue(o.restaurant.telegramChatId!, m.lateOrder(o.number, o.table.label, minutes, o.status === 'PENDING_CONFIRMATION'));
      sent++;
    }
    return sent;
  }

  /** Вечерний отчёт ресторанам, у которых сейчас «их» час. Один отчёт в день. */
  async sendEveningReports(now = new Date()): Promise<number> {
    if (!this.telegram.enabled) return 0;
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bishkek', hour: '2-digit', hourCycle: 'h23' }).format(now));
    const date = bishkekDate(now);
    const restaurants = await this.prisma.restaurant.findMany({
      where: { telegramChatId: { not: null }, reportHour: hour, status: { not: 'DISABLED' } },
    });
    let sent = 0;
    for (const r of restaurants) {
      if ((await this.redis.set(`tg:report:${r.id}:${date}`, '1', 'EX', 2 * 86_400, 'NX')) !== 'OK') continue;
      const report = await this.reports.report(r.id, date, date);
      await this.enqueue(r.telegramChatId!, botMessages(r.defaultLocale).report(r.name, date, report, r.defaultLocale as Locale));
      sent++;
    }
    return sent;
  }
}
