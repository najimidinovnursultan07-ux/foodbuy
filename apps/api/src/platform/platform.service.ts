import { Injectable } from '@nestjs/common';
import type {
  CreateRestaurantRequest,
  PlanDto,
  PlatformRestaurantDto,
  RestaurantStatusDto,
  SetSubscriptionRequest,
} from '@qrmenu/shared';
import { bishkekDate } from '@qrmenu/shared';
import { hashPin, normalizeKgPhone } from '@qrmenu/shared/server';
import { PrismaService } from '../prisma/prisma.module';
import { staffError } from '../common/api-error';

/** Последний оплаченный день включительно → конец этого дня по Бишкеку. */
const endOfBishkekDay = (date: string) => new Date(`${date}T23:59:59.999+06:00`);

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async restaurants(): Promise<PlatformRestaurantDto[]> {
    const [list, lastOrders] = await Promise.all([
      this.prisma.restaurant.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { tables: { where: { isActive: true } }, staff: { where: { isActive: true } } } },
          subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: true } },
        },
      }),
      this.prisma.order.groupBy({ by: ['restaurantId'], _max: { createdAt: true } }),
    ]);
    const last = new Map(lastOrders.map((o) => [o.restaurantId, o._max.createdAt]));
    const now = Date.now();
    return list.map((r) => {
      const sub = r.subscriptions[0];
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        tablesCount: r._count.tables,
        staffCount: r._count.staff,
        lastOrderAt: last.get(r.id)?.toISOString() ?? null,
        telegramConnected: Boolean(r.telegramChatId),
        subscription: sub
          ? {
              planId: sub.planId,
              planName: sub.plan.name,
              status: sub.status,
              periodEnd: bishkekDate(sub.periodEnd),
              note: sub.note,
              expired: sub.periodEnd.getTime() < now,
            }
          : null,
      };
    });
  }

  /** Новый ресторан «под ключ»: зал, менеджер для входа в панель и пробная подписка. */
  async createRestaurant(req: CreateRestaurantRequest) {
    const phone = normalizeKgPhone(req.managerPhone);
    if (!phone) throw staffError(400, 'INVALID_PHONE');
    if (await this.prisma.restaurant.count({ where: { slug: req.slug } })) throw staffError(409, 'SLUG_TAKEN');
    if (!(await this.prisma.plan.count({ where: { id: req.planId } }))) throw staffError(404, 'NOT_FOUND');
    const now = new Date();
    const trialEnd = bishkekDate(new Date(now.getTime() + Math.max(0, req.trialDays - 1) * 86_400_000));
    const r = await this.prisma.restaurant.create({
      data: {
        slug: req.slug,
        name: req.name,
        venues: { create: { name: 'Зал' } },
        staff: { create: { name: req.managerName, phone, pinHash: hashPin(req.managerPin), role: 'manager' } },
        subscriptions: { create: { planId: req.planId, status: 'TRIAL', periodStart: now, periodEnd: endOfBishkekDay(trialEnd) } },
      },
    });
    return { id: r.id };
  }

  /**
   * Статус ресторана: ACTIVE; MENU_ONLY — меню видно, заказы и вызовы выключены;
   * DISABLED — меню и вход персонала закрыты.
   */
  async updateRestaurant(id: string, data: { status?: RestaurantStatusDto; name?: string }) {
    const { count } = await this.prisma.restaurant.updateMany({ where: { id }, data });
    if (!count) throw staffError(404, 'NOT_FOUND');
    return { id };
  }

  /** Подписка ставится вручную (оплата — вне платформы). Каждая смена — новая запись: история сохраняется. */
  async setSubscription(restaurantId: string, req: SetSubscriptionRequest) {
    const [r, plan] = await Promise.all([
      this.prisma.restaurant.count({ where: { id: restaurantId } }),
      this.prisma.plan.count({ where: { id: req.planId } }),
    ]);
    if (!r || !plan) throw staffError(404, 'NOT_FOUND');
    await this.prisma.subscription.create({
      data: {
        restaurantId,
        planId: req.planId,
        status: req.status,
        periodStart: new Date(),
        periodEnd: endOfBishkekDay(req.periodEnd),
        note: req.note?.trim() || null,
      },
    });
    return { id: restaurantId };
  }

  async plans(): Promise<PlanDto[]> {
    const plans = await this.prisma.plan.findMany({ orderBy: { priceTyiyn: 'asc' } });
    return plans.map((p) => ({ id: p.id, code: p.code, name: p.name, priceTyiyn: p.priceTyiyn, maxTables: p.maxTables, isActive: p.isActive }));
  }

  async createPlan(data: Omit<PlanDto, 'id'>) {
    if (await this.prisma.plan.count({ where: { code: data.code } })) throw staffError(409, 'SLUG_TAKEN');
    return this.prisma.plan.create({ data, select: { id: true } });
  }

  async updatePlan(id: string, data: Partial<Omit<PlanDto, 'id' | 'code'>>) {
    const { count } = await this.prisma.plan.updateMany({ where: { id }, data });
    if (!count) throw staffError(404, 'NOT_FOUND');
    return { id };
  }
}
