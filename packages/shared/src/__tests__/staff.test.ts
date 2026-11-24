import { describe, expect, it } from 'vitest';
import { aggregateOrderStatus, ticketStatus } from '../staff';
import { pinFingerprint, signSession, verifySession } from '../session';

const st = (...s: string[]) => s.map((status) => ({ status })) as { status: never }[];

describe('статус заказа по позициям', () => {
  it('агрегирует статусы', () => {
    expect(aggregateOrderStatus(st('NEW', 'NEW'))).toBe('NEW');
    expect(aggregateOrderStatus(st('NEW', 'IN_PROGRESS'))).toBe('IN_PROGRESS');
    expect(aggregateOrderStatus(st('NEW', 'READY'))).toBe('IN_PROGRESS'); // бар отдал, кухня не начала
    expect(aggregateOrderStatus(st('READY', 'SERVED'))).toBe('READY');
    expect(aggregateOrderStatus(st('SERVED', 'SERVED', 'CANCELLED'))).toBe('SERVED');
    expect(aggregateOrderStatus(st('CANCELLED'))).toBe('CANCELLED');
  });

  it('статус тикета цеха', () => {
    expect(ticketStatus(st('NEW', 'NEW'))).toBe('NEW');
    expect(ticketStatus(st('IN_PROGRESS', 'NEW'))).toBe('IN_PROGRESS');
    expect(ticketStatus(st('READY', 'READY', 'CANCELLED'))).toBe('READY');
  });
});

describe('сессия персонала', () => {
  const secret = 's3cret';
  const base = { sid: 'st1', rid: 'r1', role: 'waiter' as const, pv: pinFingerprint('hash') };

  it('подписывается и проверяется', () => {
    expect(verifySession(signSession(base, secret), secret)).toMatchObject(base);
  });

  it('отклоняет подделку, чужой секрет и истёкший токен', () => {
    const t = signSession(base, secret);
    const [payload, sig] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ ...base, role: 'manager', exp: 9e9 })).toString('base64url');
    expect(verifySession(`${forged}.${sig}`, secret)).toBeNull();
    expect(verifySession(`${payload}.${sig}`, 'other')).toBeNull();
    expect(verifySession(signSession(base, secret, -10), secret)).toBeNull();
    expect(verifySession('garbage', secret)).toBeNull();
  });

  it('отпечаток PIN меняется вместе с хешем', () => {
    expect(pinFingerprint('a')).not.toBe(pinFingerprint('b'));
  });
});
