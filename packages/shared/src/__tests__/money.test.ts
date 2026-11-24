import { describe, expect, it } from 'vitest';
import { formatSom, percentOf, somToTyiyn } from '../money';

const nb = (s: string) => s.replace(/ /g, ' ');

describe('formatSom', () => {
  it('форматирует сомы с разделителем тысяч', () => {
    expect(formatSom(125000)).toBe(nb('1 250 сом'));
    expect(formatSom(32000)).toBe(nb('320 сом'));
    expect(formatSom(0)).toBe(nb('0 сом'));
    expect(formatSom(123456700)).toBe(nb('1 234 567 сом'));
  });
  it('показывает тыйыны, если они есть', () => {
    expect(formatSom(125050)).toBe(nb('1 250,50 сом'));
    expect(formatSom(5)).toBe(nb('0,05 сом'));
  });
  it('отрицательные суммы', () => {
    expect(formatSom(-32000)).toBe(nb('-320 сом'));
  });
  it('отклоняет дробные тыйыны', () => {
    expect(() => formatSom(1.5)).toThrow();
  });
});

describe('somToTyiyn / percentOf', () => {
  it('переводит сомы в тыйыны', () => {
    expect(somToTyiyn(1250)).toBe(125000);
    expect(somToTyiyn('1 250,5')).toBe(125050);
    expect(somToTyiyn(0.1 + 0.2)).toBe(30);
  });
  it('считает % обслуживания с округлением', () => {
    expect(percentOf(125000, 1000)).toBe(12500); // 10%
    expect(percentOf(33333, 1500)).toBe(5000); // 15% от 333,33 → 50,00
  });
});
