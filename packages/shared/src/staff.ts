import type { LocalizedText } from './i18n';
import type { BillTotals, OrderItemStatusDto, OrderStatusDto, PaymentMethodDto, WaiterCallTypeDto } from './order';
import type { StaffRoleDto } from './session';

export type StationDto = 'KITCHEN' | 'BAR';

// ───────── Вход ─────────

export interface StaffLoginRequest {
  phone: string;
  pin: string;
  /** Нужен, только если телефон есть в нескольких ресторанах */
  restaurantSlug?: string;
}

export interface StaffProfileDto {
  id: string;
  name: string;
  role: StaffRoleDto;
  station: StationDto | null;
  restaurant: { slug: string; name: string; accentColor: string; orderAlertMinutes: number };
}

export interface StaffLoginResponse {
  token: string;
  staff: StaffProfileDto;
}

// ───────── Кухня (KDS) ─────────

export type TicketStatus = 'NEW' | 'IN_PROGRESS' | 'READY';

export interface TicketItemDto {
  id: string;
  name: LocalizedText;
  modifiers: { name: LocalizedText }[];
  quantity: number;
  comment: string | null;
  status: OrderItemStatusDto;
}

/** Тикет = часть заказа для одного цеха. */
export interface KitchenTicketDto {
  orderId: string;
  number: number;
  tableLabel: string;
  station: StationDto;
  status: TicketStatus;
  /** Когда заказ попал на кухню (создан или подтверждён официантом) */
  sentAt: string;
  readyAt: string | null;
  items: TicketItemDto[];
}

export interface KitchenBoardDto {
  station: StationDto;
  /** Можно ли переключать цех (у повара с закреплённым цехом — нет) */
  canSwitchStation: boolean;
  alertMinutes: number;
  tickets: KitchenTicketDto[];
}

export type TicketAction = 'start' | 'ready' | 'back';

// ───────── Официант ─────────

export interface FeedItemDto {
  id: string;
  name: LocalizedText;
  modifiers: { name: LocalizedText }[];
  quantity: number;
  comment: string | null;
  station: StationDto;
}

export interface WaiterFeedDto {
  alertMinutes: number;
  calls: {
    id: string;
    tableLabel: string;
    type: WaiterCallTypeDto;
    paymentMethod: PaymentMethodDto | null;
    status: 'OPEN' | 'ACKNOWLEDGED';
    createdAt: string;
    handledByMe: boolean;
  }[];
  /** Заказы, ждущие подтверждения официантом */
  pending: { id: string; number: number; tableLabel: string; createdAt: string; totalTyiyn: number; items: FeedItemDto[] }[];
  /** Готово — забрать: только позиции в статусе READY */
  ready: { orderId: string; number: number; tableLabel: string; readyAt: string; items: FeedItemDto[] }[];
  bills: {
    id: string;
    tableLabel: string;
    openedAt: string;
    requestedPayment: PaymentMethodDto | null;
    ordersCount: number;
    /** Есть позиции, которые ещё не отданы гостю */
    hasUnserved: boolean;
    totals: BillTotals;
  }[];
}

export interface CloseBillRequest {
  paidWith: PaymentMethodDto;
}

/** Статус заказа из статусов позиций (без учёта ожидания подтверждения). */
export function aggregateOrderStatus(items: { status: OrderItemStatusDto }[]): Exclude<OrderStatusDto, 'PENDING_CONFIRMATION'> {
  const live = items.filter((i) => i.status !== 'CANCELLED');
  if (live.length === 0) return 'CANCELLED';
  if (live.every((i) => i.status === 'SERVED')) return 'SERVED';
  if (live.every((i) => i.status === 'READY' || i.status === 'SERVED')) return 'READY';
  if (live.every((i) => i.status === 'NEW')) return 'NEW';
  return 'IN_PROGRESS';
}

/** Статус тикета цеха по его позициям. */
export function ticketStatus(items: { status: OrderItemStatusDto }[]): TicketStatus {
  const live = items.filter((i) => i.status !== 'CANCELLED' && i.status !== 'SERVED');
  if (live.length && live.every((i) => i.status === 'READY')) return 'READY';
  if (live.every((i) => i.status === 'NEW')) return 'NEW';
  return 'IN_PROGRESS';
}
