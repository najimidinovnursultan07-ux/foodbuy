import { describe, expect, it } from 'vitest';
import { isOpenAt, isValidHours } from '../hours';

// Бишкек = UTC+6. 2026-11-23 — понедельник.
const at = (local: string) => new Date(`${local}+06:00`);

describe('часы работы', () => {
  const hours = { mon: [['10:00', '23:00']], tue: [['10:00', '23:00']], sat: [['12:00', '02:00']] } as const;

  it('обычный день', () => {
    expect(isOpenAt(hours as never, at('2026-11-23T09:59:00'))).toBe(false);
    expect(isOpenAt(hours as never, at('2026-11-23T10:00:00'))).toBe(true);
    expect(isOpenAt(hours as never, at('2026-11-23T22:59:00'))).toBe(true);
    expect(isOpenAt(hours as never, at('2026-11-23T23:00:00'))).toBe(false);
  });

  it('работа через полночь: суббота до 02:00 воскресенья', () => {
    expect(isOpenAt(hours as never, at('2026-11-28T23:30:00'))).toBe(true); // сб
    expect(isOpenAt(hours as never, at('2026-11-29T01:59:00'))).toBe(true); // вс ночью
    expect(isOpenAt(hours as never, at('2026-11-29T02:00:00'))).toBe(false);
    expect(isOpenAt(hours as never, at('2026-11-29T13:00:00'))).toBe(false); // вс — выходной
  });

  it('часы не заданы — открыто всегда', () => {
    expect(isOpenAt({}, at('2026-11-23T04:00:00'))).toBe(true);
  });

  it('валидация', () => {
    expect(isValidHours({ mon: [['10:00', '23:00']] })).toBe(true);
    expect(isValidHours({ mon: [['10:00', '24:00']] })).toBe(false);
    expect(isValidHours({ funday: [] })).toBe(false);
    expect(isValidHours({ mon: [['10:00', '10:00']] })).toBe(false);
    expect(isValidHours([])).toBe(false);
  });
});
