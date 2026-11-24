import { Injectable } from '@nestjs/common';
import {
  billTotals,
  type CreateCallRequest,
  type GuestBillDto,
  type LocalizedText,
} from '@qrmenu/shared';
import { PrismaService } from '../prisma/prisma.module';
import { PublicMenuService } from '../public-menu/public-menu.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RateLimitService } from '../common/rate-limit.service';
import { guestError } from '../common/guest-error';

const OPEN_CALL = { in: ['OPEN', 'ACKNOWLEDGED'] as ('OPEN' | 'ACKNOWLEDGED')[] };

@Injectable()
export class GuestBillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menu: PublicMenuService,
    private readonly realtime: RealtimeGateway,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Текущий открытый счёт стола: все заказы стола (дозаказы попадают сюда же). */
  async getBill(slug: string, token: string): Promise<GuestBillDto> {
    const table = await this.menu.resolveTable(slug, token);
    const restaurantId = table.restaurantId;

    const [bill, calls] = await Promise.all([
      this.prisma.tableBill.findFirst({
        where: { restaurantId, tableId: table.id, status: 'OPEN' },
        include: {
          orders: {
            where: { restaurantId },
            orderBy: { createdAt: 'asc' },
            include: { items: { where: { restaurantId }, orderBy: { id: 'asc' } } },
          },
        },
      }),
      this.prisma.waiterCall.findMany({
        where: { restaurantId, tableId: table.id, status: OPEN_CALL },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      bill: bill && {
        id: bill.id,
        openedAt: bill.openedAt.toISOString(),
        requestedPayment: bill.requestedPayment,
        billRequestedAt: bill.billRequestedAt?.toISOString() ?? null,
        orders: bill.orders.map((o) => ({
          id: o.id,
          number: o.number,
          status: o.status,
          createdAt: o.createdAt.toISOString(),
          items: o.items.map((i) => ({
            id: i.id,
            name: i.nameSnapshot as LocalizedText,
            modifiers: ((i.modifiers ?? []) as { name: LocalizedText }[]).map((m) => ({ name: m.name })),
            comment: i.comment,
            quantity: i.quantity,
            unitPriceTyiyn: i.unitPriceTyiyn,
            status: i.status,
          })),
        })),
        totals: billTotals(bill.orders, table.restaurant.serviceFeeBp),
      },
      openCalls: calls.map((c) => ({ type: c.type, paymentMethod: c.paymentMethod, createdAt: c.createdAt.toISOString() })),
    };
  }

  /** «Позвать официанта» / «Принести счёт». Повторное нажатие не плодит вызовы. */
  async createCall(slug: string, token: string, req: CreateCallRequest): Promise<{ callId: string }> {
    const table = await this.menu.resolveTable(slug, token);
    const restaurantId = table.restaurantId;
    if (table.restaurant.status !== 'ACTIVE') throw guestError(403, 'ORDERING_DISABLED');
    await this.rateLimit.hit(`call:${table.id}`, 10, 600);

    const bill = await this.prisma.tableBill.findFirst({
      where: { restaurantId, tableId: table.id, status: 'OPEN' },
      include: { _count: { select: { orders: true } } },
    });

    const paymentMethod = req.type === 'BRING_BILL' ? req.paymentMethod! : null;
    if (req.type === 'BRING_BILL') {
      if (!bill || bill._count.orders === 0) throw guestError(400, 'NO_OPEN_BILL');
      await this.prisma.tableBill.update({
        where: { id: bill.id },
        data: { requestedPayment: paymentMethod, billRequestedAt: new Date() },
      });
    }

    const existing = await this.prisma.waiterCall.findFirst({
      where: { restaurantId, tableId: table.id, type: req.type, status: OPEN_CALL },
    });
    if (existing) {
      if (existing.paymentMethod !== paymentMethod) {
        await this.prisma.waiterCall.update({ where: { id: existing.id }, data: { paymentMethod } });
        this.realtime.toStaff(restaurantId, 'call.updated', { callId: existing.id, tableId: table.id });
      }
      this.realtime.toTable(table.id, { reason: 'call.updated' });
      return { callId: existing.id };
    }

    const call = await this.prisma.waiterCall.create({
      data: { restaurantId, tableId: table.id, billId: bill?.id ?? null, type: req.type, paymentMethod },
    });
    this.realtime.toTable(table.id, { reason: 'call.created' });
    this.realtime.toStaff(restaurantId, 'call.created', { callId: call.id, tableId: table.id, type: call.type });
    return { callId: call.id };
  }
}
