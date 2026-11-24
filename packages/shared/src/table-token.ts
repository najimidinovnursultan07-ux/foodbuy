import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Подписанный токен стола для QR-ссылки: `<tableId>.<version>.<signature>`.
 * version увеличивается при перевыпуске QR — старые наклейки перестают работать.
 */
function sign(tableId: string, version: number, secret: string): string {
  return createHmac('sha256', secret).update(`table:${tableId}:${version}`).digest('base64url').slice(0, 22);
}

export function createTableToken(tableId: string, version: number, secret: string): string {
  return `${tableId}.${version}.${sign(tableId, version, secret)}`;
}

export function verifyTableToken(token: string, secret: string): { tableId: string; version: number } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [tableId, versionStr, sig] = parts as [string, string, string];
  const version = Number(versionStr);
  if (!tableId || !Number.isInteger(version) || version < 1) return null;
  const expected = Buffer.from(sign(tableId, version, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { tableId, version };
}
