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
/** scope разделяет токены персонала ресторана и платформы: один нельзя выдать за другой. */
const sign = (payload: string, secret: string, scope = 'staff') => createHmac('sha256', secret).update(`${scope}:${payload}`).digest('base64url');

function signScoped(body: object, secret: string, ttlSec: number, scope: string): string {
  const payload = b64(JSON.stringify({ ...body, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  return `${payload}.${sign(payload, secret, scope)}`;
}

export function signSession(s: Omit<StaffSession, 'exp'>, secret: string, ttlSec = SESSION_TTL_SEC): string {
  return signScoped(s, secret, ttlSec, 'staff');
}

export function verifySession(token: string, secret: string): StaffSession | null {
  return verifyScoped<StaffSession>(token, secret, 'staff');
}

/** Сессия сотрудника платформы (супер-админка). */
export interface PlatformSession {
  sid: string;
  pv: string;
  exp: number;
}

export function signPlatformSession(s: Omit<PlatformSession, 'exp'>, secret: string, ttlSec = SESSION_TTL_SEC): string {
  return signScoped(s, secret, ttlSec, 'platform');
}

export function verifyPlatformSession(token: string, secret: string): PlatformSession | null {
  return verifyScoped<PlatformSession>(token, secret, 'platform');
}

function verifyScoped<T extends { exp: number }>(token: string, secret: string, scope: string): T | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret, scope));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as T;
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
