import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  defaultSelection,
  textOnAccent,
  toggleModifier,
  unitPrice,
  validateSelection,
  type ModifierGroupDto,
} from '../menu';

const portion: ModifierGroupDto = {
  id: 'g1',
  name: { ru: 'Порция' },
  minSelect: 1,
  maxSelect: 1,
  modifiers: [
    { id: 'std', name: { ru: 'Стандарт' }, priceDeltaTyiyn: 0, isDefault: true, isAvailable: true },
    { id: 'big', name: { ru: 'Большая' }, priceDeltaTyiyn: 8000, isDefault: false, isAvailable: true },
  ],
};
const sauces: ModifierGroupDto = {
  id: 'g2',
  name: { ru: 'Соус' },
  minSelect: 0,
  maxSelect: 2,
  modifiers: [
    { id: 's1', name: { ru: 'Сметана' }, priceDeltaTyiyn: 3000, isDefault: false, isAvailable: true },
    { id: 's2', name: { ru: 'Острый' }, priceDeltaTyiyn: 2000, isDefault: false, isAvailable: true },
    { id: 's3', name: { ru: 'Чесночный' }, priceDeltaTyiyn: 2000, isDefault: false, isAvailable: false },
  ],
};
const dish = { priceTyiyn: 32000, modifierGroups: [portion, sauces] };

describe('модификаторы', () => {
  it('выбор по умолчанию валиден и даёт базовую цену', () => {
    const sel = defaultSelection(dish);
    expect(sel).toEqual({ g1: ['std'], g2: [] });
    expect(validateSelection(dish, sel)).toEqual([]);
    expect(unitPrice(dish, sel)).toBe(32000);
  });

  it('считает цену с модификаторами', () => {
    expect(unitPrice(dish, { g1: ['big'], g2: ['s1', 's2'] })).toBe(32000 + 8000 + 3000 + 2000);
  });

  it('ловит нарушения min/max, чужие и недоступные модификаторы', () => {
    const codes = (s: Record<string, string[]>) => validateSelection(dish, s).map((e) => e.code);
    expect(codes({ g1: [] })).toEqual(['TOO_FEW']);
    expect(codes({ g1: ['std', 'big'] })).toEqual(['TOO_MANY']);
    expect(codes({ g1: ['std'], g2: ['s3'] })).toEqual(['MODIFIER_UNAVAILABLE']);
    expect(codes({ g1: ['std'], g2: ['zzz'] })).toEqual(['UNKNOWN_MODIFIER']);
    expect(codes({ g1: ['std'], gX: ['a'] })).toEqual(['UNKNOWN_GROUP']);
  });

  it('радио: переключается и не снимается; чекбокс: соблюдает лимит', () => {
    let sel = defaultSelection(dish);
    sel = toggleModifier(portion, sel, 'big');
    expect(sel.g1).toEqual(['big']);
    sel = toggleModifier(portion, sel, 'big');
    expect(sel.g1).toEqual(['big']);
    sel = toggleModifier(sauces, sel, 's1');
    sel = toggleModifier(sauces, sel, 's2');
    sel = toggleModifier(sauces, sel, 's3');
    expect(sel.g2).toEqual(['s1', 's2']);
    sel = toggleModifier(sauces, sel, 's1');
    expect(sel.g2).toEqual(['s2']);
  });
});

describe('контраст', () => {
  it('выбирает читаемый цвет текста на акценте', () => {
    expect(textOnAccent('#C2410C')).toBe('#ffffff');
    expect(textOnAccent('#FACC15')).toBe('#1c1917');
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});
