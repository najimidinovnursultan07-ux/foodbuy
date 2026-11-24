import { Injectable } from '@nestjs/common';
import type { CategoryDto, DishDto, LocalizedText, PublicMenuDto } from '@qrmenu/shared';
import { verifyTableToken } from '@qrmenu/shared/server';
import { PrismaService } from '../prisma/prisma.module';
import { requireEnv } from '../config/env';
import { guestError } from '../common/guest-error';

@Injectable()
export class PublicMenuService {
  private readonly secret = requireEnv('QR_SIGNING_SECRET');

  constructor(private readonly prisma: PrismaService) {}

  /** Стол по подписанному токену из QR. Любая ошибка — 404, чтобы не подсказывать, что не так. */
  async resolveTable(slug: string, token: string) {
    const parsed = verifyTableToken(token, this.secret);
    if (!parsed) throw guestError(404, 'TABLE_NOT_FOUND');
    const table = await this.prisma.table.findFirst({
      where: { id: parsed.tableId, isActive: true, restaurant: { slug } },
      include: { restaurant: true },
    });
    if (!table || table.tokenVersion !== parsed.version) throw guestError(404, 'TABLE_NOT_FOUND');
    if (table.restaurant.status === 'DISABLED') throw guestError(403, 'RESTAURANT_DISABLED');
    return table;
  }

  async getMenu(slug: string, token: string): Promise<PublicMenuDto> {
    const table = await this.resolveTable(slug, token);
    const r = table.restaurant;
    const restaurantId = r.id;

    const [categories, dishes] = await Promise.all([
      this.prisma.category.findMany({
        where: { restaurantId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, name: true },
      }),
      this.prisma.dish.findMany({
        where: { restaurantId, isActive: true, category: { isActive: true } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          modifierGroups: {
            where: { restaurantId },
            orderBy: { sortOrder: 'asc' },
            include: { modifiers: { where: { restaurantId }, orderBy: { sortOrder: 'asc' } } },
          },
          upsellsFrom: {
            where: { restaurantId, suggestedDish: { restaurantId, isActive: true, category: { isActive: true } } },
            orderBy: { sortOrder: 'asc' },
            select: { suggestedDishId: true },
          },
        },
      }),
    ]);

    const dishMap: Record<string, DishDto> = {};
    const byCategory = new Map<string, string[]>();
    for (const d of dishes) {
      dishMap[d.id] = {
        id: d.id,
        categoryId: d.categoryId,
        name: d.name as LocalizedText,
        description: isLocalized(d.description) ? d.description : null,
        priceTyiyn: d.priceTyiyn,
        weightValue: d.weightValue,
        weightUnit: d.weightUnit,
        photoUrl: d.photoUrl,
        isHit: d.isHit,
        isSpicy: d.isSpicy,
        isHalal: d.isHalal,
        isAvailable: d.isAvailable,
        modifierGroups: d.modifierGroups.map((g) => ({
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
        })),
        upsellIds: d.upsellsFrom.map((u) => u.suggestedDishId),
      };
      const list = byCategory.get(d.categoryId) ?? [];
      list.push(d.id);
      byCategory.set(d.categoryId, list);
    }

    const categoryDtos: CategoryDto[] = categories
      .map((c) => ({ id: c.id, name: c.name as LocalizedText, dishIds: byCategory.get(c.id) ?? [] }))
      .filter((c) => c.dishIds.length > 0);

    return {
      restaurant: {
        slug: r.slug,
        name: r.name,
        logoUrl: r.logoUrl,
        accentColor: r.accentColor,
        defaultLocale: r.defaultLocale,
        status: r.status,
        orderFlow: r.orderFlow,
        serviceFeeBp: r.serviceFeeBp,
      },
      table: { id: table.id, label: table.label },
      categories: categoryDtos,
      dishes: dishMap,
    };
  }
}

function isLocalized(v: unknown): v is LocalizedText {
  return typeof v === 'object' && v !== null && typeof (v as { ru?: unknown }).ru === 'string' && (v as { ru: string }).ru !== '';
}
