import { Body, Controller, Global, Headers, HttpCode, Module, Post } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { AdminReportsService } from '../admin/admin-reports.service';
import { staffError } from '../common/api-error';
import { NotificationsService } from './notifications.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramClient, type TgUpdate } from './telegram.client';

/** Вебхук Telegram (режим с TELEGRAM_WEBHOOK_SECRET): Telegram присылает секрет в заголовке. */
@Controller('telegram')
export class TelegramWebhookController {
  constructor(private readonly bot: TelegramBotService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Headers('x-telegram-bot-api-secret-token') secret: string | undefined, @Body() update: TgUpdate) {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
    const ok = expected && secret && secret.length === expected.length && timingSafeEqual(Buffer.from(secret), Buffer.from(expected));
    if (!ok) throw staffError(401, 'UNAUTHORIZED');
    await this.bot.handleUpdate(update);
    return { ok: true };
  }
}

@Global()
@Module({
  controllers: [TelegramWebhookController],
  providers: [TelegramClient, NotificationsService, TelegramBotService, AdminReportsService],
  exports: [TelegramClient, NotificationsService, TelegramBotService, AdminReportsService],
})
export class NotificationsModule {}
