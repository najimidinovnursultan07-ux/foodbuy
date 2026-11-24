import { Injectable, Logger } from '@nestjs/common';

export interface TgUpdate {
  update_id: number;
  message?: { text?: string; chat: { id: number; type: string } };
}

export class TelegramError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Минимальный клиент Bot API. Адрес API настраивается (TELEGRAM_API_BASE) — в тестах это локальный
 * поддельный сервер. Без TELEGRAM_BOT_TOKEN бот выключен, уведомления молча не отправляются.
 */
@Injectable()
export class TelegramClient {
  private readonly log = new Logger(TelegramClient.name);
  readonly token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  readonly botUsername = process.env.TELEGRAM_BOT_USERNAME ?? '';
  private readonly base = (process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org').replace(/\/$/, '');

  get enabled(): boolean {
    return Boolean(this.token && this.botUsername);
  }

  private async call<T>(method: string, body: object, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.base}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok || !json.ok) throw new TelegramError(res.status, json.description ?? `HTTP ${res.status}`);
    return json.result as T;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Без parse_mode: названия блюд и комментарии гостей не нужно экранировать
    await this.call('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
  }

  async getUpdates(offset: number, timeoutSec: number, signal: AbortSignal): Promise<TgUpdate[]> {
    return this.call<TgUpdate[]>('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message'] }, signal);
  }

  logError(context: string, e: unknown) {
    this.log.warn(`${context}: ${(e as Error).message}`);
  }
}
