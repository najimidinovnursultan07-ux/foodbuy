import type { LocalizedText } from './i18n';
import type { WeightUnitDto } from './menu';
import type { OpeningHours } from './hours';
import type { StaffRoleDto } from './session';
import type { StationDto } from './staff';

// ───────── Меню ─────────

export interface AdminModifierDto {
  id: string;
  name: LocalizedText;
  priceDeltaTyiyn: number;
  isDefault: boolean;
  isAvailable: boolean;
}

export interface AdminModifierGroupDto {
  id: string;
  name: LocalizedText;
  minSelect: number;
  maxSelect: number;
  modifiers: AdminModifierDto[];
}

export interface AdminDishDto {
  id: string;
  categoryId: string;
  name: LocalizedText;
  description: LocalizedText | null;
  priceTyiyn: number;
  weightValue: number | null;
  weightUnit: WeightUnitDto | null;
  photoUrl: string | null;
  photoThumbUrl: string | null;
  station: StationDto;
  isHit: boolean;
  isSpicy: boolean;
  isHalal: boolean;
  isAvailable: boolean;
  isActive: boolean;
  modifierGroups: AdminModifierGroupDto[];
  upsellIds: string[];
}

export interface AdminCategoryDto {
  id: string;
  name: LocalizedText;
  isActive: boolean;
  dishIds: string[];
}

export interface AdminMenuDto {
  categories: AdminCategoryDto[];
  dishes: Record<string, AdminDishDto>;
}

/** Поля блюда, которые редактирует панель (все — при создании, часть — при правке). */
export interface DishInput {
  categoryId: string;
  name: LocalizedText;
  description: LocalizedText | null;
  priceTyiyn: number;
  weightValue: number | null;
  weightUnit: WeightUnitDto | null;
  station: StationDto;
  isHit: boolean;
  isSpicy: boolean;
  isHalal: boolean;
  isAvailable: boolean;
  isActive: boolean;
}

/** Полная замена групп модификаторов блюда. id — у существующих (сохраняются), без id — новые. */
export interface ModifierGroupsInput {
  groups: {
    id?: string;
    name: LocalizedText;
    minSelect: number;
    maxSelect: number;
    modifiers: { id?: string; name: LocalizedText; priceDeltaTyiyn: number; isDefault: boolean; isAvailable: boolean }[];
  }[];
}

// ───────── Столы ─────────

export interface AdminTableDto {
  id: string;
  label: string;
  isActive: boolean;
  tokenVersion: number;
  /** Ссылка для QR (подписанная) */
  url: string;
  hasOpenBill: boolean;
}

// ───────── Сотрудники ─────────

export interface AdminStaffDto {
  id: string;
  name: string;
  phone: string;
  role: StaffRoleDto;
  station: StationDto | null;
  isActive: boolean;
}

export interface StaffInput {
  name: string;
  phone: string;
  role: StaffRoleDto;
  station: StationDto | null;
  isActive: boolean;
  /** Только при создании или смене PIN */
  pin?: string;
}

// ───────── Настройки ─────────

export interface SettingsDto {
  name: string;
  slug: string;
  logoUrl: string | null;
  accentColor: string;
  defaultLocale: 'ru' | 'ky' | 'en';
  serviceFeeBp: number;
  orderFlow: 'DIRECT_TO_KITCHEN' | 'WAITER_CONFIRM';
  orderAlertMinutes: number;
  twoGisUrl: string | null;
  openingHours: OpeningHours;
  /** Час вечернего отчёта в Telegram (0–23, Бишкек) */
  reportHour: number;
}

export type SettingsInput = Omit<SettingsDto, 'slug' | 'logoUrl'>;

// ───────── Отчёты ─────────

export interface ReportDto {
  from: string;
  to: string;
  revenueTyiyn: number;
  serviceFeeTyiyn: number;
  billsCount: number;
  avgCheckTyiyn: number;
  ordersCount: number;
  cashTyiyn: number;
  cardTyiyn: number;
  byDay: { date: string; revenueTyiyn: number; billsCount: number }[];
  topDishes: { name: LocalizedText; quantity: number; revenueTyiyn: number }[];
  reviews: {
    count: number;
    /** Средняя оценка с точностью до десятых; null — отзывов нет */
    avgRating: number | null;
    /** Оценок 1–3★ */
    lowCount: number;
    recent: { rating: number; comment: string | null; createdAt: string; tableLabel: string }[];
  };
}

// ───────── Telegram ─────────

export interface TelegramStatusDto {
  /** Бот настроен на платформе (есть токен) */
  available: boolean;
  connected: boolean;
  reportHour: number;
}

export const MAX_REPORT_DAYS = 366;
