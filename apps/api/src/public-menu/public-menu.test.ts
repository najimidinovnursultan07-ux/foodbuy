import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@qrmenu/db';
import { createTableToken } from '@qrmenu/shared/server';
import type { PublicMenuDto } from '@qrmenu/shared';
import { AppModule } from '../app.module';
import { requireEnv } from '../config/env';

// Требует сидов демо-ресторана. Второй ресторан создаётся и удаляется тестом.
const prisma = new PrismaClient();
const secret = requireEnv('QR_SIGNING_SECRET');
const RIVAL = 'rival-test';

let app: INestApplication;
let demoToken: string;
let rival: { tableId: string; hiddenDishId: string; visibleDishId: string };

const get = (slug: string, token: string) => request(app.getHttpServer()).get(`/public/menu/${slug}/${token}`);

beforeAll(async () => {
  await prisma.restaurant.deleteMany({ where: { slug: RIVAL } });
  const demoTable = await prisma.table.findFirstOrThrow({
    where: { restaurant: { slug: 'ala-too-demo' }, label: '1' },
  });
  demoToken = createTableToken(demoTable.id, demoTable.tokenVersion, secret);

  const r = await prisma.restaurant.create({ data: { slug: RIVAL, name: 'Конкурент' } });
  const venue = await prisma.venue.create({ data: { restaurantId: r.id, name: 'Зал' } });
  const table = await prisma.table.create({ data: { restaurantId: r.id, venueId: venue.id, label: '1' } });
  const cat = await prisma.category.create({ data: { restaurantId: r.id, name: { ru: 'Еда' } } });
  const visible = await prisma.dish.create({
    data: { restaurantId: r.id, categoryId: cat.id, name: { ru: 'Видимое' }, priceTyiyn: 10000, sortOrder: 1 },
  });
  const hidden = await prisma.dish.create({
    data: { restaurantId: r.id, categoryId: cat.id, name: { ru: 'Скрытое' }, priceTyiyn: 10000, isActive: false },
  });
  await prisma.upsell.create({ data: { restaurantId: r.id, dishId: visible.id, suggestedDishId: hidden.id } });
  // Пустая категория не должна попасть в меню
  await prisma.category.create({ data: { restaurantId: r.id, name: { ru: 'Пусто' }, sortOrder: 5 } });
  rival = { tableId: table.id, hiddenDishId: hidden.id, visibleDishId: visible.id };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await prisma.restaurant.deleteMany({ where: { slug: RIVAL } });
  await prisma.$disconnect();
  await app?.close();
});

describe('GET /public/menu/:slug/:token', () => {
  it('отдаёт меню демо-ресторана по подписанному токену', async () => {
    const res = await get('ala-too-demo', demoToken).expect(200);
    const menu = res.body as PublicMenuDto;
    expect(res.headers['cache-control']).toBe('no-store');
    expect(menu.restaurant).toMatchObject({ slug: 'ala-too-demo', name: 'Ала-Тоо', status: 'ACTIVE', serviceFeeBp: 1000 });
    expect(menu.table.label).toBe('1');
    expect(menu.categories.map((c) => c.name.ru)).toEqual(['Горячие блюда', 'Супы', 'Салаты и закуски', 'Напитки']);

    const dishes = Object.values(menu.dishes);
    const lagman = dishes.find((d) => d.name.ru === 'Лагман')!;
    expect(lagman.priceTyiyn).toBe(32000);
    expect(lagman.modifierGroups.map((g) => g.name.ru)).toEqual(['Порция', 'Острота']);
    expect(lagman.upsellIds.map((id) => menu.dishes[id]!.name.ru)).toEqual(['Лепёшка', 'Чай', 'Салат «Ачичук»']);
    expect(dishes.find((d) => d.name.ru === 'Бешбармак')!.isAvailable).toBe(false); // стоп-лист виден как «нет в наличии»

    // Все id в категориях и подсказках ссылаются на блюда из ответа
    for (const c of menu.categories) for (const id of c.dishIds) expect(menu.dishes[id]).toBeDefined();
    for (const d of dishes) for (const id of d.upsellIds) expect(menu.dishes[id]).toBeDefined();
  });

  it('не отдаёт чужие данные: токен стола другого ресторана со slug демо — 404', async () => {
    const rivalToken = createTableToken(rival.tableId, 1, secret);
    await get('ala-too-demo', rivalToken).expect(404);
    const res = await get(RIVAL, rivalToken).expect(200);
    const menu = res.body as PublicMenuDto;
    expect(Object.keys(menu.dishes)).toEqual([rival.visibleDishId]);
    expect(menu.dishes[rival.visibleDishId]!.upsellIds).toEqual([]); // подсказка на скрытое блюдо отброшена
    expect(menu.categories).toHaveLength(1); // пустая категория скрыта
  });

  it('отклоняет поддельный токен и неизвестный ресторан', async () => {
    await get('ala-too-demo', demoToken.slice(0, -2) + 'xx').expect(404);
    await get('ala-too-demo', 'nonsense').expect(404);
    await get('no-such-place', demoToken).expect(404);
  });

  it('старый QR перестаёт работать после перевыпуска', async () => {
    const oldToken = createTableToken(rival.tableId, 1, secret);
    await prisma.table.update({ where: { id: rival.tableId }, data: { tokenVersion: 2 } });
    try {
      await get(RIVAL, oldToken).expect(404);
      await get(RIVAL, createTableToken(rival.tableId, 2, secret)).expect(200);
    } finally {
      await prisma.table.update({ where: { id: rival.tableId }, data: { tokenVersion: 1 } });
    }
  });

  it('режим «только меню» отдаёт меню со статусом, выключенный ресторан — 403', async () => {
    const token = createTableToken(rival.tableId, 1, secret);
    await prisma.restaurant.update({ where: { slug: RIVAL }, data: { status: 'MENU_ONLY' } });
    expect((await get(RIVAL, token).expect(200)).body.restaurant.status).toBe('MENU_ONLY');
    await prisma.restaurant.update({ where: { slug: RIVAL }, data: { status: 'DISABLED' } });
    await get(RIVAL, token).expect(403);
  });
});
