import { describe, expect, it } from 'vitest';
import { billTotals, bishkekDate, bishkekTime } from '../order';

describe('billTotals', () => {
  it('суммирует позиции и добавляет % обслуживания, без отменённых', () => {
    const t = billTotals(
      [
        {
          status: 'NEW',
          items: [
            { status: 'NEW', quantity: 2, unitPriceTyiyn: 40000 },
            { status: 'CANCELLED', quantity: 1, unitPriceTyiyn: 99999 },
          ],
        },
        { status: 'CANCELLED', items: [{ status: 'NEW', quantity: 1, unitPriceTyiyn: 50000 }] },
        { status: 'SERVED', items: [{ status: 'SERVED', quantity: 1, unitPriceTyiyn: 10000 }] },
      ],
      1000,
    );
    expect(t).toEqual({ subtotalTyiyn: 90000, serviceFeeBp: 1000, serviceFeeTyiyn: 9000, totalTyiyn: 99000 });
  });

  it('пустой счёт — нули', () => {
    expect(billTotals([], 1000).totalTyiyn).toBe(0);
  });
});

describe('время Бишкека (UTC+6)', () => {
  it('дата переключается в полночь по Бишкеку, а не по UTC', () => {
    expect(bishkekDate(new Date('2026-11-24T17:59:00Z'))).toBe('2026-11-24');
    expect(bishkekDate(new Date('2026-11-24T18:00:00Z'))).toBe('2026-11-25');
  });
  it('время в формате ЧЧ:ММ', () => {
    expect(bishkekTime('2026-11-24T08:05:00Z')).toBe('14:05');
  });
});
