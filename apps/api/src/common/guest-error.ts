import { HttpException } from '@nestjs/common';
import type { GuestErrorBody, GuestErrorCode } from '@qrmenu/shared';

/** Ошибка для гостя: стабильный код вместо текста — переводит клиент. */
export function guestError(status: number, code: GuestErrorCode, extra: Partial<GuestErrorBody> = {}): HttpException {
  const body: GuestErrorBody = { statusCode: status, code, ...extra };
  return new HttpException(body, status);
}
