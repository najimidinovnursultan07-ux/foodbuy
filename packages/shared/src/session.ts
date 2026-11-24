import { createHmac, timingSafeEqual } from 'node:crypto';

export type StaffRoleDto = 'waiter' | 'kitchen' | 'manager';

/** Сессия персонала (подписанный токен, хранится на устройстве). */
export interface StaffSession {
  /** staffId */
  sid: string;
  /** restaurantId */
  rid: string;
  role: StaffRoleDto;
  /** Отпечаток PIN: смена PIN делает старые сессии недействительными */
  pv: string;
  /** Unix-время истечения, сек */
  exp: number;
}

export const SESSION_TTL_SEC = 14 * 3600; // смена + запас

const b64 = (s: string) => Buffer.from(s).toString('base64url');
const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(`staff:${payload}`).digest('base64url');

export function signSession(s: Omit<StaffSession, 'exp'>, secret: string, ttlSec = SESSION_TTL_SEC): string {
  const payload = b64(JSON.stringify({ ...s, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token: string, secret: string): StaffSession | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as StaffSession;
    if (typeof s.exp !== 'number' || s.exp * 1000 < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

/** Отпечаток хеша PIN для сессии (не раскрывает PIN). */
export function pinFingerprint(pinHash: string): string {
  return createHmac('sha256', 'pin-version').update(pinHash).digest('base64url').slice(0, 12);
}
