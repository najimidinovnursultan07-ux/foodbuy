import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.module';
import { REDIS } from '../redis/redis.module';
import { TelegramClient, type TgUpdate } from './telegram.client';
import { botMessages } from './bot-i18n';
import { runsBackgroundWork } from '../config/role';

const LINK_TTL_SEC = 15 * 60;
// Префикс как у очереди: отдельные окружения (и тесты) не мешают друг другу
const PREFIX = () => process.env.QUEUE_PREFIX ?? 'qrmenu';

/**
 * Бот владельца. Подключение: менеджер в панели получает одноразовую ссылку
 * t.me/<бот>?start=<код>, владелец открывает её — чат привязывается к ресторану.
 * Обновления: вебхук (если задан TELEGRAM_WEBHOOK_SECRET) или long polling;
 * при нескольких инстансах API опрашивает один — блокировка в Redis.
 */
@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TelegramBotService.name);
  private readonly instance = randomBytes(6).toString('hex');
  private readonly lockKey = `${PREFIX()}:tg:poll-lock`;
  private readonly offsetKey = `${PREFIX()}:tg:offset`;
  private abort = new AbortController();
  private polling?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onModuleInit() {
    const webhook = Boolean(process.env.TELEGRAM_WEBHOOK_SECRET);
    if (this.telegram.enabled && !webhook && runsBackgroundWork() && process.env.TELEGRAM_POLLING !== 'off') {
      this.polling = this.pollLoop();
    }
  }

  async onModuleDestroy() {
    this.abort.abort();
    await this.polling?.catch(() => undefined);
    await this.redis.eval(`if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0`, 1, this.lockKey, this.instance).catch(() => undefined);
  }

  /** Одноразовая ссылка для подключения чата к ресторану. */
  async createLink(restaurantId: string): Promise<{ url: string }> {
    const code = randomBytes(9).toString('base64url');
    await this.redis.set(`tg:link:${code}`, restaurantId, 'EX', LINK_TTL_SEC);
    return { url: `https://t.me/${this.telegram.botUsername}?start=${code}` };
  }

  async handleUpdate(update: TgUpdate): Promise<void> {
    const msg = update.message;
    if (!msg?.text) return;
    const chatId = String(msg.chat.id);
    const text = msg.text.trim();

    const start = /^\/start(?:@\w+)?(?:\s+([\w-]{6,64}))?$/.exec(text);
    if (start) {
      const code = start[1];
      if (!code) return this.reply(chatId, botMessages('ru').help);
      const restaurantId = await this.redis.getdel(`tg:link:${code}`);
      if (!restaurantId) return this.reply(chatId, botMessages('ru').badCode);
      const r = await this.prisma.restaurant.update({ where: { id: restaurantId }, data: { telegramChatId: chatId } });
      return this.reply(chatId, botMessages(r.defaultLocale).linked(r.name));
    }
    if (/^\/stop(?:@\w+)?$/.test(text)) {
      await this.prisma.restaurant.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } });
      return this.reply(chatId, botMessages('ru').unlinked);
    }
    return this.reply(chatId, botMessages('ru').help);
  }

  private async reply(chatId: string, text: string) {
    try {
      await this.telegram.sendMessage(chatId, text);
    } catch (e) {
      this.telegram.logError('Ответ бота', e);
    }
  }

  private async pollLoop(): Promise<void> {
    const signal = this.abort.signal;
    while (!signal.aborted) {
      try {
        const lock = await this.redis.set(this.lockKey, this.instance, 'PX', 60_000, 'NX');
        const mine = lock === 'OK' || (await this.redis.get(this.lockKey)) === this.instance;
        if (!mine) {
          await sleep(15_000, signal);
          continue;
        }
        await this.redis.pexpire(this.lockKey, 60_000);
        const offset = Number(await this.redis.get(this.offsetKey)) || 0;
        const updates = await this.telegram.getUpdates(offset, 25, AbortSignal.any([signal, AbortSignal.timeout(35_000)]));
        for (const u of updates) {
          await this.handleUpdate(u);
          await this.redis.set(this.offsetKey, String(u.update_id + 1));
        }
      } catch (e) {
        if (signal.aborted) break;
        this.telegram.logError('Опрос Telegram', e);
        await sleep(5_000, signal);
      }
    }
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });
