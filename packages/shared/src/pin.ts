import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** PIN персонала: 4–6 цифр, храним только scrypt-хеш. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export function hashPin(pin: string): string {
  if (!isValidPin(pin)) throw new Error('PIN должен состоять из 4–6 цифр');
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return ['scrypt', salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export function verifyPin(pin: string, stored: string): boolean {
  const [algo, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = scryptSync(pin, Buffer.from(saltB64, 'base64url'), expected.length);
  return timingSafeEqual(expected, actual);
}

/** Нормализация телефона КР к формату +996XXXXXXXXX. */
export function normalizeKgPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.startsWith('996') ? digits.slice(3) : digits.startsWith('0') ? digits.slice(1) : digits;
  return /^\d{9}$/.test(local) ? `+996${local}` : null;
}
