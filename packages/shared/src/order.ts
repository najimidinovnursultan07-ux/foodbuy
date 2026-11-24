import type { LocalizedText } from './i18n';
import type { ModifierSelection } from './menu';
import { percentOf } from './money';
import { TIMEZONE } from './constants';

// ───────── Запросы гостя ─────────

export const ORDER_LIMITS = {
  maxLines: 50,
  maxQuantity: 20,
  maxCommentLength: 200,
} as const;

export interface CreateOrderLine {
  dishId: string;
  selection: ModifierSelection;
  comment?: string;
  quantity: number;
}

export interface CreateOrderRequest {
  /** Анонимный id устройства (localStorage) — для лимита заказов */
  deviceId: string;
  /** Ключ идемпотентности: повтор той же отправки вернёт уже созданный заказ */
  clientRequestId: string;
  items: CreateOrderLine[];
}

export interface CreateOrderResponse {
  orderId: string;
  number: number;
  status: OrderStatusDto;
  billId: string;
}

export type PaymentMethodDto = 'CASH' | 'CARD';
export type WaiterCallTypeDto = 'CALL_WAITER' | 'BRING_BILL';

export interface CreateCallRequest {
  type: WaiterCallTypeDto;
  paymentMethod?: PaymentMethodDto;
}

/** Коды ошибок API, которые показываем гостю по-человечески */
export type GuestErrorCode =
  | 'TABLE_NOT_FOUND'
  | 'RESTAURANT_DISABLED'
  | 'ORDERING_DISABLED'
  | 'DISH_UNAVAILABLE'
  | 'INVALID_MODIFIERS'
  | 'INVALID_REQUEST'
  | 'RATE_LIMITED'
  | 'NO_OPEN_BILL';

export interface GuestErrorBody {
  statusCode: number;
  code: GuestErrorCode;
  /** Для DISH_UNAVAILABLE — какие блюда закончились */
  dishIds?: string[];
}

// ───────── Счёт стола глазами гостя ─────────

export type OrderStatusDto = 'PENDING_CONFIRMATION' | 'NEW' | 'IN_PROGRESS' | 'READY' | 'SERVED' | 'CANCELLED';
export type OrderItemStatusDto = 'NEW' | 'IN_PROGRESS' | 'READY' | 'SERVED' | 'CANCELLED';

export interface GuestOrderItemDto {
  id: string;
  name: LocalizedText;
  modifiers: { name: LocalizedText }[];
  comment: string | null;
  quantity: number;
  unitPriceTyiyn: number;
  status: OrderItemStatusDto;
}

export interface GuestOrderDto {
  id: string;
  number: number;
  status: OrderStatusDto;
  createdAt: string;
  items: GuestOrderItemDto[];
}

export interface GuestBillDto {
  bill: null | {
    id: string;
    openedAt: string;
    requestedPayment: PaymentMethodDto | null;
    billRequestedAt: string | null;
    orders: GuestOrderDto[];
    totals: BillTotals;
  };
  /** Незакрытые вызовы стола — чтобы показать «официант идёт» */
  openCalls: { type: WaiterCallTypeDto; paymentMethod: PaymentMethodDto | null; createdAt: string }[];
}

/** Событие в комнате стола: гость просто перечитывает счёт. */
export interface TableUpdatedEvent {
  reason: 'order.created' | 'order.updated' | 'call.created' | 'call.updated' | 'bill.updated';
}

// ───────── Расчёт ─────────

export interface BillTotals {
  subtotalTyiyn: number;
  serviceFeeBp: number;
  serviceFeeTyiyn: number;
  totalTyiyn: number;
}

/** Сумма счёта: отменённые позиции и заказы не считаем. */
export function billTotals(
  orders: { status: OrderStatusDto; items: { status: OrderItemStatusDto; quantity: number; unitPriceTyiyn: number }[] }[],
  serviceFeeBp: number,
): BillTotals {
  let subtotal = 0;
  for (const o of orders) {
    if (o.status === 'CANCELLED') continue;
    for (const i of o.items) if (i.status !== 'CANCELLED') subtotal += i.quantity * i.unitPriceTyiyn;
  }
  const fee = percentOf(subtotal, serviceFeeBp);
  return { subtotalTyiyn: subtotal, serviceFeeBp, serviceFeeTyiyn: fee, totalTyiyn: subtotal + fee };
}

/** Календарная дата в Бишкеке (YYYY-MM-DD) — для нумерации заказов за день. */
export function bishkekDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** «14:05» по Бишкеку */
export function bishkekTime(d: Date | string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}
