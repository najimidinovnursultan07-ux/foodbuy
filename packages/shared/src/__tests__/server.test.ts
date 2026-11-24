import { describe, expect, it } from 'vitest';
import { createTableToken, verifyTableToken } from '../table-token';
import { hashPin, normalizeKgPhone, verifyPin } from '../pin';
import { pickText } from '../i18n';

describe('токен стола', () => {
  const secret = 'test-secret';
  it('подписывает и проверяет', () => {
    const t = createTableToken('tbl_1', 1, secret);
    expect(verifyTableToken(t, secret)).toEqual({ tableId: 'tbl_1', version: 1 });
  });
  it('отклоняет подделку и чужой секрет', () => {
    const t = createTableToken('tbl_1', 1, secret);
    expect(verifyTableToken(t.replace('tbl_1', 'tbl_2'), secret)).toBeNull();
    expect(verifyTableToken(t, 'other')).toBeNull();
    expect(verifyTableToken('garbage', secret)).toBeNull();
    expect(verifyTableToken('tbl_1.0.x', secret)).toBeNull();
  });
});

describe('PIN и телефон', () => {
  it('хеширует и проверяет PIN', () => {
    const h = hashPin('1234');
    expect(verifyPin('1234', h)).toBe(true);
    expect(verifyPin('4321', h)).toBe(false);
    expect(() => hashPin('12')).toThrow();
  });
  it('нормализует номер КР', () => {
    expect(normalizeKgPhone('0700 123 456')).toBe('+996700123456');
    expect(normalizeKgPhone('+996 (555) 12-34-56')).toBe('+996555123456');
    expect(normalizeKgPhone('12345')).toBeNull();
  });
});

describe('pickText', () => {
  it('фолбэк на русский', () => {
    expect(pickText({ ru: 'Плов', ky: 'Палоо' }, 'ky')).toBe('Палоо');
    expect(pickText({ ru: 'Плов' }, 'en')).toBe('Плов');
    expect(pickText({ ru: 'Плов', en: '  ' }, 'en')).toBe('Плов');
  });
});
