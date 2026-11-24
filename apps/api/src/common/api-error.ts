import { HttpException } from '@nestjs/common';

export type StaffErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_CREDENTIALS'
  | 'MULTIPLE_RESTAURANTS'
  | 'RESTAURANT_DISABLED'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED';

/** Ошибка API персонала: стабильный код, текст переводит клиент. */
export function staffError(status: number, code: StaffErrorCode, extra: Record<string, unknown> = {}): HttpException {
  return new HttpException({ statusCode: status, code, ...extra }, status);
}
