import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { Prisma } from '@qrmenu/db';
import {
  bishkekDate,
  unitPrice,
  validateSelection,
  type CreateOrderRequest,
  type CreateOrderResponse,
  type LocalizedText,
  type ModifierGroupDto,
} from '@qrmenu/shared';
import { PrismaService } from '../prisma/prisma.module';
import { REDIS } from '../redis/redis.module';
import { PublicMenuService } from '../public-menu/public-menu.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RateLimitService } from '../common/rate-limit.service';
import { guestError } from '../common/guest-error';

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

@Injectable()
export class GuestOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menu: PublicMenuService,
    private readonly realtime: RealtimeGateway,
    private readonly rateLimit: RateLimitService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async create(slug: string, token: string, req: CreateOrderRequest): Promise<CreateOrderResponse> {
    const table = await this.menu.resolveTable(slug, token);
    const r = table.restaurant;
    const restaurantId = r.id;
    if (r.status !== 'ACTIVE') throw guestError(403, 'ORDERING_DISABLED');

    // Повторная отправка (плохая сеть) — возвращаем уже созданный заказ
    const replay = await this.findByRequestId(restaurantId, table.id, req.clientRequestId);
    if (replay) return replay;

    await this.rateLimit.hit(`order:device:${restaurantId}:${req.deviceId}`, r.ordersPerDeviceHour, 3600);
    await this.rateLimit.hit(`order:table:${table.id}`, r.ordersPerDeviceHour * 3, 3600);

    // Блюда — только этого ресторана, активные и в наличии. Цены считаем сами, клиенту не верим.
    const dishIds = [...new Set(req.items.map((i) => i.dishId))];
    const dishes = await this.prisma.dish.findMany({
      where: { restaurantId, id: { in: dishIds }, isActive: true, category: { isActive: true } },
      include: {
        modifierGroups: {
          where: { restaurantId },
          orderBy: { sortOrder: 'asc' },
          include: { modifiers: { where: { restaurantId }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    const byId = new Map(dishes.map((d) => [d.id, d]));
    const unavailable = dishIds.filter((id) => !byId.get(id)?.isAvailable);
    if (unavailable.length) throw guestError(409, 'DISH_UNAVAILABLE', { dishIds: unavailable });

    const items = req.items.map((line) => {
      const dish = byId.get(line.dishId)!;
      const groups: ModifierGroupDto[] = dish.modifierGroups.map((g) => ({
        id: g.id,
        name: g.name as LocalizedText,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        modifiers: g.modifiers.map((m) => ({
          id: m.id,
          name: m.name as LocalizedText,
          priceDeltaTyiyn: m.priceDeltaTyiyn,
          isDefault: m.isDefault,
          isAvailable: m.isAvailable,
        })),
      }));
      const priced = { priceTyiyn: dish.priceTyiyn, modifierGroups: groups };
      if (validateSelection(priced, line.selection).length) {
        throw guestError(400, 'INVALID_MODIFIERS', { dishIds: [dish.id] });
      }
      const chosen = groups.flatMap((g) =>
        g.modifiers
          .filter((m) => (line.selection[g.id] ?? []).includes(m.id))
          .map((m) => ({ id: m.id, groupId: g.id, name: m.name, priceDeltaTyiyn: m.priceDeltaTyiyn })),
      );
      return {
        restaurantId,
        dishId: dish.id,
        nameSnapshot: dish.name as Prisma.InputJsonValue,
        modifiers: chosen as Prisma.InputJsonValue,
        unitPriceTyiyn: unitPrice(priced, line.selection),
        quantity: line.quantity,
        comment: line.comment?.trim() || null,
        station: dish.station,
      };
    });
    const totalTyiyn = items.reduce((s, i) => s + i.unitPriceTyiyn * i.quantity, 0);

    // Номер заказа за день (по Бишкеку). Пропуски номеров допустимы.
    const numKey = `ordnum:${restaurantId}:${bishkekDate()}`;
    const [[, number]] = (await this.redis.multi().incr(numKey).expire(numKey, 2 * 86400).exec()) as [[null, number], unknown];

    const status = r.orderFlow === 'WAITER_CONFIRM' ? 'PENDING_CONFIRMATION' : 'NEW';
    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        const bill = await this.openBill(tx, restaurantId, table.id);
        return tx.order.create({
          data: {
            restaurantId,
            billId: bill.id,
            tableId: table.id,
            number,
            status,
            deviceId: req.deviceId,
            clientRequestId: req.clientRequestId,
            totalTyiyn,
            items: { create: items },
          },
        });
      });
    } catch (e) {
      // Гонка двух одинаковых отправок — вторая получает первый заказ
      if (isUniqueViolation(e)) {
        const again = await this.findByRequestId(restaurantId, table.id, req.clientRequestId);
        if (again) return again;
      }
      throw e;
    }

    this.realtime.toTable(table.id, { reason: 'order.created' });
    this.realtime.toStaff(restaurantId, 'order.created', { orderId: order.id, tableId: table.id, status });
    return { orderId: order.id, number: order.number, status: order.status, billId: order.billId };
  }

  /** Открытый счёт стола; если его нет — открываем. Уникальный частичный индекс не даёт открыть два. */
  private async openBill(tx: Prisma.TransactionClient, restaurantId: string, tableId: string) {
    const existing = await tx.tableBill.findFirst({ where: { restaurantId, tableId, status: 'OPEN' } });
    if (existing) return existing;
    // ON CONFLICT DO NOTHING — без ошибки, которая сломала бы транзакцию при гонке
    await tx.$executeRaw`
      INSERT INTO "TableBill" ("id", "restaurantId", "tableId", "status", "openedAt")
      VALUES (${'bill_' + crypto.randomUUID().replace(/-/g, '')}, ${restaurantId}, ${tableId}, 'OPEN', now())
      ON CONFLICT ("tableId") WHERE "status" = 'OPEN' DO NOTHING`;
    return tx.tableBill.findFirstOrThrow({ where: { restaurantId, tableId, status: 'OPEN' } });
  }

  private async findByRequestId(restaurantId: string, tableId: string, clientRequestId: string) {
    const o = await this.prisma.order.findUnique({
      where: { restaurantId_clientRequestId: { restaurantId, clientRequestId } },
    });
    if (!o || o.tableId !== tableId) return null;
    return { orderId: o.id, number: o.number, status: o.status, billId: o.billId };
  }
}
