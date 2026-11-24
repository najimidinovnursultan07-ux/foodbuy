import type { LocalizedText } from './i18n';

// ───────── DTO публичного меню (API → гость) ─────────

export type RestaurantStatusDto = 'ACTIVE' | 'MENU_ONLY' | 'DISABLED';
export type WeightUnitDto = 'G' | 'ML' | 'PCS';

export interface ModifierDto {
  id: string;
  name: LocalizedText;
  priceDeltaTyiyn: number;
  isDefault: boolean;
  isAvailable: boolean;
}

export interface ModifierGroupDto {
  id: string;
  name: LocalizedText;
  minSelect: number;
  maxSelect: number;
  modifiers: ModifierDto[];
}

export interface DishDto {
  id: string;
  categoryId: string;
  name: LocalizedText;
  description: LocalizedText | null;
  priceTyiyn: number;
  weightValue: number | null;
  weightUnit: WeightUnitDto | null;
  photoUrl: string | null;
  isHit: boolean;
  isSpicy: boolean;
  isHalal: boolean;
  isAvailable: boolean;
  modifierGroups: ModifierGroupDto[];
  /** id блюд «к этому берут», по порядку */
  upsellIds: string[];
}

export interface CategoryDto {
  id: string;
  name: LocalizedText;
  dishIds: string[];
}

export interface PublicMenuDto {
  restaurant: {
    slug: string;
    name: string;
    logoUrl: string | null;
    accentColor: string;
    defaultLocale: string;
    status: RestaurantStatusDto;
    serviceFeeBp: number;
  };
  table: { id: string; label: string };
  categories: CategoryDto[];
  dishes: Record<string, DishDto>;
}

// ───────── Выбор модификаторов и цена ─────────

/** Выбор гостя: groupId → id выбранных модификаторов */
export type ModifierSelection = Record<string, string[]>;

export type SelectionError =
  | { code: 'TOO_FEW'; groupId: string; min: number }
  | { code: 'TOO_MANY'; groupId: string; max: number }
  | { code: 'UNKNOWN_GROUP'; groupId: string }
  | { code: 'UNKNOWN_MODIFIER'; groupId: string; modifierId: string }
  | { code: 'MODIFIER_UNAVAILABLE'; groupId: string; modifierId: string };

type DishForPricing = Pick<DishDto, 'priceTyiyn' | 'modifierGroups'>;

/** Выбор по умолчанию: модификаторы с isDefault (если доступны). */
export function defaultSelection(dish: DishForPricing): ModifierSelection {
  const sel: ModifierSelection = {};
  for (const g of dish.modifierGroups) {
    sel[g.id] = g.modifiers.filter((m) => m.isDefault && m.isAvailable).map((m) => m.id).slice(0, g.maxSelect);
  }
  return sel;
}

/** Проверка выбора. Тот же код использует сервер при приёме заказа. */
export function validateSelection(dish: DishForPricing, selection: ModifierSelection): SelectionError[] {
  const errors: SelectionError[] = [];
  const groups = new Map(dish.modifierGroups.map((g) => [g.id, g]));
  for (const groupId of Object.keys(selection)) {
    if (!groups.has(groupId)) errors.push({ code: 'UNKNOWN_GROUP', groupId });
  }
  for (const g of dish.modifierGroups) {
    const ids = [...new Set(selection[g.id] ?? [])];
    for (const id of ids) {
      const m = g.modifiers.find((x) => x.id === id);
      if (!m) errors.push({ code: 'UNKNOWN_MODIFIER', groupId: g.id, modifierId: id });
      else if (!m.isAvailable) errors.push({ code: 'MODIFIER_UNAVAILABLE', groupId: g.id, modifierId: id });
    }
    if (ids.length < g.minSelect) errors.push({ code: 'TOO_FEW', groupId: g.id, min: g.minSelect });
    if (ids.length > g.maxSelect) errors.push({ code: 'TOO_MANY', groupId: g.id, max: g.maxSelect });
  }
  return errors;
}

/** Цена одной позиции с модификаторами, тыйыны. Неизвестные id игнорируются. */
export function unitPrice(dish: DishForPricing, selection: ModifierSelection): number {
  let total = dish.priceTyiyn;
  for (const g of dish.modifierGroups) {
    const ids = new Set(selection[g.id] ?? []);
    for (const m of g.modifiers) if (ids.has(m.id)) total += m.priceDeltaTyiyn;
  }
  return total;
}

/**
 * Переключение модификатора по правилам группы:
 * maxSelect = 1 — радиокнопка (обязательную группу нельзя очистить); иначе — чекбокс с лимитом.
 */
export function toggleModifier(
  group: Pick<ModifierGroupDto, 'id' | 'minSelect' | 'maxSelect'>,
  selection: ModifierSelection,
  modifierId: string,
): ModifierSelection {
  const current = selection[group.id] ?? [];
  let next: string[];
  if (current.includes(modifierId)) {
    next = current.filter((id) => id !== modifierId);
    if (group.maxSelect === 1 && group.minSelect >= 1) next = current; // радио: снять нельзя
  } else if (group.maxSelect === 1) {
    next = [modifierId];
  } else {
    next = current.length >= group.maxSelect ? current : [...current, modifierId];
  }
  return { ...selection, [group.id]: next };
}

// ───────── Цвет ─────────

function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return 1;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Цвет текста на кнопке акцентного цвета: белый или почти чёрный — что контрастнее. */
export function textOnAccent(accent: string): '#ffffff' | '#1c1917' {
  return contrastRatio(accent, '#ffffff') >= contrastRatio(accent, '#1c1917') ? '#ffffff' : '#1c1917';
}
