import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Интеграционный тест: требует применённых миграций и `pnpm db:seed`.
const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe('демо-ресторан из сидов', () => {
  it('создан с меню, столами, персоналом и подпиской', async () => {
    const r = await prisma.restaurant.findUniqueOrThrow({
      where: { slug: 'ala-too-demo' },
      include: { _count: { select: { dishes: true, tables: true, staff: true, categories: true, subscriptions: true } } },
    });
    expect(r._count.categories).toBe(4);
    expect(r._count.dishes).toBeGreaterThanOrEqual(10);
    expect(r._count.tables).toBe(10);
    expect(r._count.staff).toBe(4);
    expect(r._count.subscriptions).toBe(1);
  });

  it('все блюда и модификаторы принадлежат своему ресторану', async () => {
    const r = await prisma.restaurant.findUniqueOrThrow({ where: { slug: 'ala-too-demo' } });
    const foreignMods = await prisma.modifier.count({
      where: { group: { restaurantId: r.id }, NOT: { restaurantId: r.id } },
    });
    const foreignUpsells = await prisma.upsell.count({
      where: { dish: { restaurantId: r.id }, suggestedDish: { NOT: { restaurantId: r.id } } },
    });
    expect(foreignMods).toBe(0);
    expect(foreignUpsells).toBe(0);
  });

  it('цены — целые тыйыны, у блюд есть ru/ky/en', async () => {
    const dishes = await prisma.dish.findMany({ where: { restaurant: { slug: 'ala-too-demo' } } });
    for (const d of dishes) {
      expect(Number.isInteger(d.priceTyiyn)).toBe(true);
      const name = d.name as Record<string, string>;
      expect(name.ru && name.ky && name.en).toBeTruthy();
    }
    expect(dishes.some((d) => !d.isAvailable)).toBe(true); // стоп-лист
  });

  it('на столе не может быть двух открытых счетов', async () => {
    const table = await prisma.table.findFirstOrThrow({ where: { restaurant: { slug: 'ala-too-demo' } } });
    const bill = await prisma.tableBill.create({ data: { restaurantId: table.restaurantId, tableId: table.id } });
    try {
      await expect(
        prisma.tableBill.create({ data: { restaurantId: table.restaurantId, tableId: table.id } }),
      ).rejects.toThrow();
    } finally {
      await prisma.tableBill.delete({ where: { id: bill.id } });
    }
  });
});
