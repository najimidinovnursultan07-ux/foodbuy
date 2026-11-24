import { Injectable } from '@nestjs/common';
import type { OrderItemStatus, Station } from '@qrmenu/db';
import { ticketStatus, type KitchenBoardDto, type LocalizedText, type TicketAction } from '@qrmenu/shared';
import { PrismaService } from '../prisma/prisma.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { staffError } from '../common/api-error';
import { recomputeOrderStatus } from './order-status';
import type { AuthedStaff } from './staff-auth.service';

const LIVE: OrderItemStatus[] = ['NEW', 'IN_PROGRESS', 'READY'];
const BOARD_HORIZON_MS = 12 * 3600 * 1000; // старьё с прошлой смены не показываем

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Цех: у повара с закреплённым цехом — только свой. */
  private stationFor(staff: AuthedStaff, requested?: string): { station: Station; canSwitch: boolean } {
    if (staff.role === 'kitchen' && staff.station) {
      if (requested && requested !== staff.station) throw staffError(403, 'FORBIDDEN');
      return { station: staff.station, canSwitch: false };
    }
    return { station: requested === 'BAR' ? 'BAR' : 'KITCHEN', canSwitch: true };
  }

  async board(staff: AuthedStaff, requested?: string): Promise<KitchenBoardDto> {
    const { station, canSwitch } = this.stationFor(staff, requested);
    const restaurantId = staff.restaurantId;
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: { in: ['NEW', 'IN_PROGRESS', 'READY'] },
        createdAt: { gte: new Date(Date.now() - BOARD_HORIZON_MS) },
        items: { some: { station, status: { in: LIVE } } },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        table: { select: { label: true } },
        items: { where: { restaurantId, station, status: { in: LIVE } }, orderBy: { id: 'asc' } },
      },
    });

    return {
      station,
      canSwitchStation: canSwitch,
      alertMinutes: staff.restaurant.orderAlertMinutes,
      tickets: orders.map((o) => ({
        orderId: o.id,
        number: o.number,
        tableLabel: o.table.label,
        station,
        status: ticketStatus(o.items),
        sentAt: (o.confirmedAt ?? o.createdAt).toISOString(),
        readyAt: o.readyAt?.toISOString() ?? null,
        items: o.items.map((i) => ({
          id: i.id,
          name: i.nameSnapshot as LocalizedText,
          modifiers: ((i.modifiers ?? []) as { name: LocalizedText }[]).map((m) => ({ name: m.name })),
          quantity: i.quantity,
          comment: i.comment,
          status: i.status,
        })),
      })),
    };
  }

  /** Начать / Готово / Вернуть назад — для всего тикета цеха. */
  async ticketAction(staff: AuthedStaff, orderId: string, requestedStation: string, action: TicketAction) {
    const { station } = this.stationFor(staff, requestedStation);
    const restaurantId = staff.restaurantId;

    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.findFirst({
        where: { id: orderId, restaurantId, status: { in: ['NEW', 'IN_PROGRESS', 'READY'] } },
        include: { items: { where: { station, status: { in: LIVE } }, select: { status: true } } },
      });
      if (!o || o.items.length === 0) throw staffError(404, 'NOT_FOUND');

      const current = ticketStatus(o.items);
      const [from, to]: [OrderItemStatus[], OrderItemStatus] =
        action === 'start'
          ? [['NEW'], 'IN_PROGRESS']
          : action === 'ready'
            ? [['NEW', 'IN_PROGRESS'], 'READY']
            : current === 'READY'
              ? [['READY'], 'IN_PROGRESS']
              : [['IN_PROGRESS'], 'NEW'];

      const { count } = await tx.orderItem.updateMany({
        where: { orderId: o.id, restaurantId, station, status: { in: from } },
        data: { status: to },
      });
      if (count === 0) throw staffError(409, 'INVALID_STATE');
      return recomputeOrderStatus(tx, restaurantId, o.id);
    });

    this.realtime.toStaff(restaurantId, 'order.updated', { orderId: order.id, status: order.status });
    this.realtime.toTable(order.tableId, { reason: 'order.updated' });
    return { orderId: order.id, status: order.status };
  }
}
