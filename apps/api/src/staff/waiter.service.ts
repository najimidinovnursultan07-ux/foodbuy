import { Injectable } from '@nestjs/common';
import type { OrderItem } from '@qrmenu/db';
import {
  billTotals,
  type CloseBillRequest,
  type FeedItemDto,
  type LocalizedText,
  type WaiterFeedDto,
} from '@qrmenu/shared';
import { PrismaService } from '../prisma/prisma.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { staffError } from '../common/api-error';
import { recomputeOrderStatus } from './order-status';
import type { AuthedStaff } from './staff-auth.service';

const feedItem = (i: OrderItem): FeedItemDto => ({
  id: i.id,
  name: i.nameSnapshot as LocalizedText,
  modifiers: ((i.modifiers ?? []) as { name: LocalizedText }[]).map((m) => ({ name: m.name })),
  quantity: i.quantity,
  comment: i.comment,
  station: i.station,
});

@Injectable()
export class WaiterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async feed(staff: AuthedStaff): Promise<WaiterFeedDto> {
    const restaurantId = staff.restaurantId;
    const [calls, pending, readyItems, bills] = await Promise.all([
      this.prisma.waiterCall.findMany({
        where: { restaurantId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        orderBy: { createdAt: 'asc' },
        include: { table: { select: { label: true } } },
      }),
      this.prisma.order.findMany({
        where: { restaurantId, status: 'PENDING_CONFIRMATION' },
        orderBy: { createdAt: 'asc' },
        include: { table: { select: { label: true } }, items: { where: { restaurantId }, orderBy: { id: 'asc' } } },
      }),
      this.prisma.orderItem.findMany({
        where: { restaurantId, status: 'READY', order: { status: { in: ['IN_PROGRESS', 'READY'] } } },
        orderBy: { id: 'asc' },
        include: { order: { include: { table: { select: { label: true } } } } },
      }),
      this.prisma.tableBill.findMany({
        where: { restaurantId, status: 'OPEN' },
        orderBy: { openedAt: 'asc' },
        include: {
          table: { select: { label: true } },
          orders: { where: { restaurantId }, include: { items: { where: { restaurantId } } } },
        },
      }),
    ]);

    const ready = new Map<string, WaiterFeedDto['ready'][number]>();
    for (const i of readyItems) {
      const entry = ready.get(i.orderId) ?? {
        orderId: i.orderId,
        number: i.order.number,
        tableLabel: i.order.table.label,
        readyAt: (i.order.readyAt ?? i.order.startedAt ?? i.order.createdAt).toISOString(),
        items: [],
      };
      entry.items.push(feedItem(i));
      ready.set(i.orderId, entry);
    }

    return {
      alertMinutes: staff.restaurant.orderAlertMinutes,
      calls: calls.map((c) => ({
        id: c.id,
        tableLabel: c.table.label,
        type: c.type,
        paymentMethod: c.paymentMethod,
        status: c.status as 'OPEN' | 'ACKNOWLEDGED',
        createdAt: c.createdAt.toISOString(),
        handledByMe: c.handledByStaffId === staff.id,
      })),
      pending: pending.map((o) => ({
        id: o.id,
        number: o.number,
        tableLabel: o.table.label,
        createdAt: o.createdAt.toISOString(),
        totalTyiyn: o.totalTyiyn,
        items: o.items.map(feedItem),
      })),
      ready: [...ready.values()],
      bills: bills.map((b) => ({
        id: b.id,
        tableLabel: b.table.label,
        openedAt: b.openedAt.toISOString(),
        requestedPayment: b.requestedPayment,
        ordersCount: b.orders.filter((o) => o.status !== 'CANCELLED').length,
        hasUnserved: b.orders.some(
          (o) => o.status === 'PENDING_CONFIRMATION' || o.items.some((i) => ['NEW', 'IN_PROGRESS', 'READY'].includes(i.status)),
        ),
        totals: billTotals(b.orders, staff.restaurant.serviceFeeBp),
      })),
    };
  }

  // ───────── Вызовы ─────────

  async callAction(staff: AuthedStaff, callId: string, action: 'ack' | 'done') {
    const { count } = await this.prisma.waiterCall.updateMany({
      where: { id: callId, restaurantId: staff.restaurantId, status: action === 'ack' ? 'OPEN' : { in: ['OPEN', 'ACKNOWLEDGED'] } },
      data:
        action === 'ack'
          ? { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), handledByStaffId: staff.id }
          : { status: 'DONE', doneAt: new Date(), handledByStaffId: staff.id },
    });
    if (count === 0) throw staffError(409, 'INVALID_STATE');
    const call = await this.prisma.waiterCall.findFirstOrThrow({ where: { id: callId, restaurantId: staff.restaurantId } });
    this.emit(staff.restaurantId, call.tableId, 'call.updated', { callId });
    return { callId, status: call.status };
  }

  // ───────── Заказы ─────────

  /** Подтвердить заказ — он уходит на кухню. */
  async confirm(staff: AuthedStaff, orderId: string) {
    const order = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id: orderId, restaurantId: staff.restaurantId, status: 'PENDING_CONFIRMATION' },
        data: { status: 'NEW', confirmedAt: new Date(), confirmedByStaffId: staff.id },
      });
      if (count === 0) throw staffError(409, 'INVALID_STATE');
      return tx.order.findFirstOrThrow({ where: { id: orderId } });
    });
    this.emit(staff.restaurantId, order.tableId, 'order.updated', { orderId, status: order.status });
    return { orderId, status: order.status };
  }

  /** Отклонить заказ: можно, пока кухня его не начала. */
  async reject(staff: AuthedStaff, orderId: string) {
    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.findFirst({
        where: { id: orderId, restaurantId: staff.restaurantId, status: { in: ['PENDING_CONFIRMATION', 'NEW'] } },
      });
      if (!o) throw staffError(409, 'INVALID_STATE');
      await tx.orderItem.updateMany({ where: { orderId, restaurantId: staff.restaurantId }, data: { status: 'CANCELLED' } });
      return tx.order.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    });
    this.emit(staff.restaurantId, order.tableId, 'order.updated', { orderId, status: order.status });
    return { orderId, status: order.status };
  }

  /** «Отдано»: все готовые позиции заказа отнесены гостю. */
  async served(staff: AuthedStaff, orderId: string) {
    const order = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.orderItem.updateMany({
        where: { orderId, restaurantId: staff.restaurantId, status: 'READY' },
        data: { status: 'SERVED' },
      });
      if (count === 0) throw staffError(409, 'INVALID_STATE');
      return recomputeOrderStatus(tx, staff.restaurantId, orderId);
    });
    this.emit(staff.restaurantId, order.tableId, 'order.updated', { orderId, status: order.status });
    return { orderId, status: order.status };
  }

  // ───────── Счёт ─────────

  /**
   * Закрыть счёт: гость заплатил официанту (наличные/карта) — платформа деньги не проводит.
   * Неподтверждённые заказы отменяются, открытые вызовы стола закрываются, суммы фиксируются.
   */
  async closeBill(staff: AuthedStaff, billId: string, req: CloseBillRequest) {
    const restaurantId = staff.restaurantId;
    const bill = await this.prisma.$transaction(async (tx) => {
      const b = await tx.tableBill.findFirst({ where: { id: billId, restaurantId, status: 'OPEN' } });
      if (!b) throw staffError(409, 'INVALID_STATE');

      const pending = await tx.order.findMany({ where: { billId, restaurantId, status: 'PENDING_CONFIRMATION' }, select: { id: true } });
      if (pending.length) {
        const ids = pending.map((o) => o.id);
        await tx.orderItem.updateMany({ where: { orderId: { in: ids } }, data: { status: 'CANCELLED' } });
        await tx.order.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      }

      const orders = await tx.order.findMany({ where: { billId, restaurantId }, include: { items: true } });
      const totals = billTotals(orders, staff.restaurant.serviceFeeBp);
      await tx.waiterCall.updateMany({
        where: { restaurantId, tableId: b.tableId, status: { in: ['OPEN', 'ACKNOWLEDGED'] } },
        data: { status: 'DONE', doneAt: new Date(), handledByStaffId: staff.id },
      });
      return tx.tableBill.update({
        where: { id: b.id },
        data: {
          status: 'CLOSED',
          paidWith: req.paidWith,
          subtotalTyiyn: totals.subtotalTyiyn,
          serviceFeeTyiyn: totals.serviceFeeTyiyn,
          totalTyiyn: totals.totalTyiyn,
          closedAt: new Date(),
          closedByStaffId: staff.id,
        },
      });
    });
    this.emit(restaurantId, bill.tableId, 'bill.updated', { billId });
    return { billId, status: bill.status, totalTyiyn: bill.totalTyiyn };
  }

  private emit(restaurantId: string, tableId: string, event: string, payload: Record<string, unknown>) {
    this.realtime.toStaff(restaurantId, event, payload);
    this.realtime.toTable(tableId, { reason: event as 'order.updated' });
  }
}
