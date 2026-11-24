import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@qrmenu/db';
import type { AdminDishDto, AdminMenuDto, DishInput, LocalizedText, ModifierGroupsInput } from '@qrmenu/shared';
import { PrismaService } from '../prisma/prisma.module';
import { StorageService } from '../storage/storage.service';
import { processDishPhoto } from '../storage/images';
import { staffError } from '../common/api-error';

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Редактор меню. Каждый запрос ограничен restaurantId менеджера. */
@Injectable()
export class AdminMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getMenu(restaurantId: string): Promise<AdminMenuDto> {
    const [categories, dishes] = await Promise.all([
      this.prisma.category.findMany({ where: { restaurantId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.dish.findMany({
        where: { restaurantId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          modifierGroups: { orderBy: { sortOrder: 'asc' }, include: { modifiers: { orderBy: { sortOrder: 'asc' } } } },
          upsellsFrom: { orderBy: { sortOrder: 'asc' }, select: { suggestedDishId: true } },
        },
      }),
    ]);
    const map: Record<string, AdminDishDto> = {};
    for (const d of dishes) {
      map[d.id] = {
        id: d.id,
        categoryId: d.categoryId,
        name: d.name as LocalizedText,
        description: (d.description as LocalizedText | null)?.ru ? (d.description as LocalizedText) : null,
        priceTyiyn: d.priceTyiyn,
        weightValue: d.weightValue,
        weightUnit: d.weightUnit,
        photoUrl: d.photoUrl,
        photoThumbUrl: d.photoThumbUrl,
        station: d.station,
        isHit: d.isHit,
        isSpicy: d.isSpicy,
        isHalal: d.isHalal,
        isAvailable: d.isAvailable,
        isActive: d.isActive,
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
    }
    return {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name as LocalizedText,
        isActive: c.isActive,
        dishIds: dishes.filter((d) => d.categoryId === c.id).map((d) => d.id),
      })),
      dishes: map,
    };
  }

  // ───────── Категории ─────────

  async createCategory(restaurantId: string, name: LocalizedText) {
    const last = await this.prisma.category.aggregate({ where: { restaurantId }, _max: { sortOrder: true } });
    return this.prisma.category.create({
      data: { restaurantId, name: json(name), sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true },
    });
  }

  async updateCategory(restaurantId: string, id: string, data: { name?: LocalizedText; isActive?: boolean }) {
    const { count } = await this.prisma.category.updateMany({
      where: { id, restaurantId },
      data: { ...(data.name ? { name: json(data.name) } : {}), ...(data.isActive !== undefined ? { isActive: data.isActive } : {}) },
    });
    if (!count) throw staffError(404, 'NOT_FOUND');
    return { id };
  }

  /** Удалить можно только пустую категорию — чтобы случайно не стереть блюда. */
  async deleteCategory(restaurantId: string, id: string) {
    if (await this.prisma.dish.count({ where: { restaurantId, categoryId: id } })) throw staffError(409, 'CATEGORY_NOT_EMPTY');
    const { count } = await this.prisma.category.deleteMany({ where: { id, restaurantId } });
    if (!count) throw staffError(404, 'NOT_FOUND');
    return { id };
  }

  async reorderCategories(restaurantId: string, ids: string[]) {
    await this.assertOwned('category', restaurantId, ids);
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.category.update({ where: { id }, data: { sortOrder: i } })));
    return { ok: true };
  }

  // ───────── Блюда ─────────

  async createDish(restaurantId: string, input: DishInput) {
    await this.assertOwned('category', restaurantId, [input.categoryId]);
    const last = await this.prisma.dish.aggregate({ where: { restaurantId, categoryId: input.categoryId }, _max: { sortOrder: true } });
    return this.prisma.dish.create({
      data: { ...this.dishData(input), restaurantId, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true },
    });
  }

  async updateDish(restaurantId: string, id: string, input: Partial<DishInput>) {
    if (input.categoryId) await this.assertOwned('category', restaurantId, [input.categoryId]);
    const { count } = await this.prisma.dish.updateMany({ where: { id, restaurantId }, data: this.dishData(input) });
    if (!count) throw staffError(404, 'NOT_FOUND');
    return { id };
  }

  async deleteDish(restaurantId: string, id: string) {
    const dish = await this.prisma.dish.findFirst({ where: { id, restaurantId } });
    if (!dish) throw staffError(404, 'NOT_FOUND');
    await this.prisma.dish.delete({ where: { id } }); // в истории заказов остаются снимки названий
    await Promise.all([this.storage.remove(dish.photoUrl), this.storage.remove(dish.photoThumbUrl)]);
    return { id };
  }

  async reorderDishes(restaurantId: string, categoryId: string, ids: string[]) {
    await this.assertOwned('category', restaurantId, [categoryId]);
    const n = await this.prisma.dish.count({ where: { restaurantId, categoryId, id: { in: ids } } });
    if (n !== new Set(ids).size) throw staffError(404, 'NOT_FOUND');
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.dish.update({ where: { id }, data: { sortOrder: i } })));
    return { ok: true };
  }

  private dishData(i: Partial<DishInput>): Prisma.DishUncheckedUpdateInput & Prisma.DishUncheckedCreateInput {
    const d: Record<string, unknown> = { ...i };
    if (i.name) d.name = json(i.name);
    if (i.description !== undefined) d.description = json(i.description ?? {});
    if (i.weightValue === null || i.weightUnit === null) {
      d.weightValue = null;
      d.weightUnit = null;
    }
    return d as Prisma.DishUncheckedUpdateInput & Prisma.DishUncheckedCreateInput;
  }

  // ───────── Модификаторы, подсказки, стоп-лист ─────────

  /** Полная замена групп модификаторов: существующие id сохраняются, остальные удаляются. */
  async setModifiers(restaurantId: string, dishId: string, input: ModifierGroupsInput) {
    for (const g of input.groups) {
      const available = g.modifiers.filter((m) => m.isAvailable).length;
      const defaults = g.modifiers.filter((m) => m.isDefault).length;
      if (g.minSelect > g.maxSelect || g.minSelect > g.modifiers.length || defaults > g.maxSelect || available === 0) {
        throw staffError(400, 'INVALID_MODIFIERS');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const dish = await tx.dish.findFirst({
        where: { id: dishId, restaurantId },
        include: { modifierGroups: { include: { modifiers: { select: { id: true } } } } },
      });
      if (!dish) throw staffError(404, 'NOT_FOUND');
      const groupIds = new Set(dish.modifierGroups.map((g) => g.id));
      const modIds = new Set(dish.modifierGroups.flatMap((g) => g.modifiers.map((m) => m.id)));
      // Чужие id не принимаем
      for (const g of input.groups) {
        if (g.id && !groupIds.has(g.id)) throw staffError(400, 'INVALID_MODIFIERS');
        for (const m of g.modifiers) if (m.id && !modIds.has(m.id)) throw staffError(400, 'INVALID_MODIFIERS');
      }
      const keepGroups = input.groups.map((g) => g.id).filter(Boolean) as string[];
      await tx.modifierGroup.deleteMany({ where: { dishId, restaurantId, id: { notIn: keepGroups } } });

      for (const [gi, g] of input.groups.entries()) {
        const groupData = { name: json(g.name), minSelect: g.minSelect, maxSelect: g.maxSelect, sortOrder: gi };
        const group = g.id
          ? await tx.modifierGroup.update({ where: { id: g.id }, data: groupData })
          : await tx.modifierGroup.create({ data: { ...groupData, restaurantId, dishId } });
        const keepMods = g.modifiers.map((m) => m.id).filter(Boolean) as string[];
        await tx.modifier.deleteMany({ where: { groupId: group.id, id: { notIn: keepMods } } });
        for (const [mi, m] of g.modifiers.entries()) {
          const modData = {
            name: json(m.name),
            priceDeltaTyiyn: m.priceDeltaTyiyn,
            isDefault: m.isDefault,
            isAvailable: m.isAvailable,
            sortOrder: mi,
            groupId: group.id,
          };
          if (m.id) await tx.modifier.update({ where: { id: m.id }, data: modData });
          else await tx.modifier.create({ data: { ...modData, restaurantId } });
        }
      }
    });
    return { id: dishId };
  }

  async setUpsells(restaurantId: string, dishId: string, ids: string[]) {
    const unique = [...new Set(ids)].filter((x) => x !== dishId).slice(0, 10);
    await this.assertOwned('dish', restaurantId, [dishId, ...unique]);
    await this.prisma.$transaction([
      this.prisma.upsell.deleteMany({ where: { restaurantId, dishId } }),
      this.prisma.upsell.createMany({
        data: unique.map((suggestedDishId, i) => ({ restaurantId, dishId, suggestedDishId, sortOrder: i })),
      }),
    ]);
    return { id: dishId };
  }

  async setModifierAvailability(restaurantId: string, id: string, isAvailable: boolean) {
    const { count } = await this.prisma.modifier.updateMany({ where: { id, restaurantId }, data: { isAvailable } });
    if (!count) throw staffError(404, 'NOT_FOUND');
    return { id };
  }

  // ───────── Фото ─────────

  async uploadPhoto(restaurantId: string, dishId: string, file: Buffer) {
    const dish = await this.prisma.dish.findFirst({ where: { id: dishId, restaurantId } });
    if (!dish) throw staffError(404, 'NOT_FOUND');
    const { full, thumb } = await processDishPhoto(file);
    const key = `r/${restaurantId}/dishes/${dishId}-${randomBytes(6).toString('hex')}`;
    const [photoUrl, photoThumbUrl] = await Promise.all([
      this.storage.put(`${key}.webp`, full, 'image/webp'),
      this.storage.put(`${key}_t.webp`, thumb, 'image/webp'),
    ]);
    await this.prisma.dish.update({ where: { id: dishId }, data: { photoUrl, photoThumbUrl } });
    await Promise.all([this.storage.remove(dish.photoUrl), this.storage.remove(dish.photoThumbUrl)]);
    return { photoUrl, photoThumbUrl };
  }

  async deletePhoto(restaurantId: string, dishId: string) {
    const dish = await this.prisma.dish.findFirst({ where: { id: dishId, restaurantId } });
    if (!dish) throw staffError(404, 'NOT_FOUND');
    await this.prisma.dish.update({ where: { id: dishId }, data: { photoUrl: null, photoThumbUrl: null } });
    await Promise.all([this.storage.remove(dish.photoUrl), this.storage.remove(dish.photoThumbUrl)]);
    return { id: dishId };
  }

  private async assertOwned(model: 'category' | 'dish', restaurantId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    const n =
      model === 'category'
        ? await this.prisma.category.count({ where: { restaurantId, id: { in: unique } } })
        : await this.prisma.dish.count({ where: { restaurantId, id: { in: unique } } });
    if (n !== unique.length) throw staffError(404, 'NOT_FOUND');
  }
}
