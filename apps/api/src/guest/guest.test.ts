import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@qrmenu/db';
import { createTableToken } from '@qrmenu/shared/server';
import type { CreateOrderLine, GuestBillDto, TableUpdatedEvent } from '@qrmenu/shared';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { requireEnv } from '../config/env';

// Отдельный тестовый ресторан: создаётся и удаляется тестом, демо-данные не трогаем.
const prisma = new PrismaClient();
const secret = requireEnv('QR_SIGNING_SECRET');
const SLUG = 'guest-flow-test';
const OTHER = 'guest-flow-other';

let app: INestApplication;
let baseUrl: string;
let tokens: string[] = [];
let tableIds: string[] = [];
let d: { lagman: string; tea: string; sold: string; foreign: string; portion: string; std: string; big: string };

const http = () => request(app.getHttpServer());
const uid = () => randomUUID();
const order = (t: number, items: CreateOrderLine[], deviceId = uid(), clientRequestId = uid()) =>
  http().post(`/public/orders/${SLUG}/${tokens[t]}`).send({ deviceId, clientRequestId, items });
const bill = async (t: number) => (await http().get(`/public/bill/${SLUG}/${tokens[t]}`).expect(200)).body as GuestBillDto;
const lagman = (big = false, quantity = 1): CreateOrderLine => ({
  dishId: d.lagman,
  selection: { [d.portion]: [big ? d.big : d.std] },
  quantity,
});

beforeAll(async () => {
  await prisma.restaurant.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const r = await prisma.restaurant.create({ data: { slug: SLUG, name: 'Тест', serviceFeeBp: 1000, ordersPerDeviceHour: 5 } });
  const venue = await prisma.venue.create({ data: { restaurantId: r.id, name: 'Зал' } });
  for (let i = 1; i <= 8; i++) {
    const t = await prisma.table.create({ data: { restaurantId: r.id, venueId: venue.id, label: String(i) } });
    tableIds.push(t.id);
    tokens.push(createTableToken(t.id, 1, secret));
  }
  const cat = await prisma.category.create({ data: { restaurantId: r.id, name: { ru: 'Еда' } } });
  const lag = await prisma.dish.create({
    data: {
      restaurantId: r.id,
      categoryId: cat.id,
      name: { ru: 'Лагман', ky: 'Лагман' },
      priceTyiyn: 32000,
      modifierGroups: {
        create: {
          restaurantId: r.id,
          name: { ru: 'Порция' },
          minSelect: 1,
          maxSelect: 1,
          modifiers: {
            create: [
              { restaurantId: r.id, name: { ru: 'Стандарт' }, isDefault: true, sortOrder: 0 },
              { restaurantId: r.id, name: { ru: 'Большая' }, priceDeltaTyiyn: 8000, sortOrder: 1 },
            ],
          },
        },
      },
    },
    include: { modifierGroups: { include: { modifiers: { orderBy: { sortOrder: 'asc' } } } } },
  });
  const tea = await prisma.dish.create({
    data: { restaurantId: r.id, categoryId: cat.id, name: { ru: 'Чай' }, priceTyiyn: 10000, station: 'BAR' },
  });
  const sold = await prisma.dish.create({
    data: { restaurantId: r.id, categoryId: cat.id, name: { ru: 'Закончилось' }, priceTyiyn: 5000, isAvailable: false },
  });
  const o = await prisma.restaurant.create({ data: { slug: OTHER, name: 'Другой' } });
  const ocat = await prisma.category.create({ data: { restaurantId: o.id, name: { ru: 'Еда' } } });
  const foreign = await prisma.dish.create({
    data: { restaurantId: o.id, categoryId: ocat.id, name: { ru: 'Чужое' }, priceTyiyn: 100 },
  });
  const g = lag.modifierGroups[0]!;
  d = { lagman: lag.id, tea: tea.id, sold: sold.id, foreign: foreign.id, portion: g.id, std: g.modifiers[0]!.id, big: g.modifiers[1]!.id };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.listen(0);
  baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
});

afterAll(async () => {
  await app?.close();
  await prisma.restaurant.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  await prisma.$disconnect();
});

describe('заказ гостя', () => {
  it('создаёт заказ с серверной ценой, открывает счёт, дозаказ идёт в тот же счёт', async () => {
    const first = await order(0, [lagman(true, 2), { dishId: d.tea, selection: {}, quantity: 1, comment: '  с лимоном ' }]).expect(201);
    expect(first.body).toMatchObject({ status: 'NEW', number: expect.any(Number) });

    const second = await order(0, [{ dishId: d.tea, selection: {}, quantity: 2 }]).expect(201);
    expect(second.body.billId).toBe(first.body.billId);
    expect(second.body.number).toBe(first.body.number + 1);

    const b = await bill(0);
    expect(b.bill!.orders).toHaveLength(2);
    const items = b.bill!.orders[0]!.items;
    expect(items[0]).toMatchObject({ name: { ru: 'Лагман' }, quantity: 2, unitPriceTyiyn: 40000, modifiers: [{ name: { ru: 'Большая' } }] });
    expect(items[1]).toMatchObject({ comment: 'с лимоном', unitPriceTyiyn: 10000 });
    // (400×2 + 100) + 100×2 = 1100 сом, +10% = 1210 сом
    expect(b.bill!.totals).toEqual({ subtotalTyiyn: 110000, serviceFeeBp: 1000, serviceFeeTyiyn: 11000, totalTyiyn: 121000 });

    const kitchenItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: first.body.orderId, dishId: d.tea } });
    expect(kitchenItem.station).toBe('BAR'); // цех для KDS
  });

  it('повторная отправка с тем же ключом не создаёт дубль', async () => {
    const device = uid();
    const key = uid();
    const a = await order(1, [lagman()], device, key).expect(201);
    const b = await order(1, [lagman()], device, key).expect(201);
    expect(b.body.orderId).toBe(a.body.orderId);
    expect(await prisma.order.count({ where: { tableId: tableIds[1] } })).toBe(1);
  });

  it('два первых заказа одновременно — один счёт на столе', async () => {
    const [a, b, c] = await Promise.all([order(2, [lagman()]), order(2, [lagman()]), order(2, [lagman()])]);
    expect([a.status, b.status, c.status]).toEqual([201, 201, 201]);
    expect(new Set([a.body.billId, b.body.billId, c.body.billId]).size).toBe(1);
    expect(await prisma.tableBill.count({ where: { tableId: tableIds[2] } })).toBe(1);
  });

  it('отклоняет блюда из стоп-листа, чужого ресторана, неверные модификаторы и мусор', async () => {
    const sold = await order(3, [lagman(), { dishId: d.sold, selection: {}, quantity: 1 }]).expect(409);
    expect(sold.body).toMatchObject({ code: 'DISH_UNAVAILABLE', dishIds: [d.sold] });
    const foreign = await order(3, [{ dishId: d.foreign, selection: {}, quantity: 1 }]).expect(409);
    expect(foreign.body.dishIds).toEqual([d.foreign]);
    const mods = await order(3, [{ dishId: d.lagman, selection: {}, quantity: 1 }]).expect(400);
    expect(mods.body.code).toBe('INVALID_MODIFIERS');
    expect((await order(3, [{ ...lagman(), quantity: 0 }]).expect(400)).body.code).toBe('INVALID_REQUEST');
    expect((await order(3, []).expect(400)).body.code).toBe('INVALID_REQUEST');
    await http().post(`/public/orders/${SLUG}/${tokens[3]}`).send({ items: 'x' }).expect(400);
    expect(await prisma.order.count({ where: { tableId: tableIds[3] } })).toBe(0);
  });

  it('лимит заказов с одного устройства', async () => {
    const device = uid();
    for (let i = 0; i < 5; i++) await order(4, [lagman()], device).expect(201);
    expect((await order(4, [lagman()], device).expect(429)).body.code).toBe('RATE_LIMITED');
    await order(4, [lagman()]).expect(201); // другое устройство — можно
  });

  it('режим «сначала официант» и «только меню»', async () => {
    await prisma.restaurant.update({ where: { slug: SLUG }, data: { orderFlow: 'WAITER_CONFIRM' } });
    expect((await order(5, [lagman()]).expect(201)).body.status).toBe('PENDING_CONFIRMATION');
    await prisma.restaurant.update({ where: { slug: SLUG }, data: { orderFlow: 'DIRECT_TO_KITCHEN', status: 'MENU_ONLY' } });
    try {
      expect((await order(5, [lagman()]).expect(403)).body.code).toBe('ORDERING_DISABLED');
      await http().post(`/public/calls/${SLUG}/${tokens[5]}`).send({ type: 'CALL_WAITER' }).expect(403);
      await bill(5); // счёт посмотреть можно
    } finally {
      await prisma.restaurant.update({ where: { slug: SLUG }, data: { status: 'ACTIVE' } });
    }
  });
});

describe('вызовы официанта', () => {
  const call = (t: number, body: object) => http().post(`/public/calls/${SLUG}/${tokens[t]}`).send(body);

  it('«позвать официанта» не дублируется, «счёт» требует заказов и запоминает способ оплаты', async () => {
    const a = await call(6, { type: 'CALL_WAITER' }).expect(201);
    const b = await call(6, { type: 'CALL_WAITER' }).expect(201);
    expect(b.body.callId).toBe(a.body.callId);

    expect((await call(6, { type: 'BRING_BILL', paymentMethod: 'CARD' }).expect(400)).body.code).toBe('NO_OPEN_BILL');
    await call(6, { type: 'BRING_BILL' }).expect(400); // без способа оплаты

    await order(6, [lagman()]).expect(201);
    await call(6, { type: 'BRING_BILL', paymentMethod: 'CARD' }).expect(201);
    await call(6, { type: 'BRING_BILL', paymentMethod: 'CASH' }).expect(201); // передумал

    const b2 = await bill(6);
    expect(b2.bill!.requestedPayment).toBe('CASH');
    expect(b2.openCalls.map((c) => [c.type, c.paymentMethod])).toEqual([
      ['CALL_WAITER', null],
      ['BRING_BILL', 'CASH'],
    ]);
    expect(await prisma.waiterCall.count({ where: { tableId: tableIds[6] } })).toBe(2);
  });
});

describe('WebSocket: комната стола', () => {
  const connect = () =>
    new Promise<Socket>((resolve, reject) => {
      const s = io(baseUrl, { transports: ['websocket'], forceNew: true });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  const join = (s: Socket, token: string) =>
    s.emitWithAck('guest:join', { slug: SLUG, token }) as Promise<{ ok: boolean }>;

  it('гости стола получают событие о новом заказе, другой стол — нет', async () => {
    const guest = await connect();
    const neighbour = await connect();
    try {
      expect(await join(guest, 'forged.1.token')).toEqual({ ok: false });
      expect(await join(guest, tokens[7]!)).toEqual({ ok: true });
      expect(await join(neighbour, tokens[0]!)).toEqual({ ok: true });

      const neighbourEvents: TableUpdatedEvent[] = [];
      neighbour.on('table.updated', (e: TableUpdatedEvent) => neighbourEvents.push(e));
      const got = new Promise<TableUpdatedEvent>((resolve) => guest.once('table.updated', resolve));

      await order(7, [lagman()]).expect(201); // заказ с другого телефона за этим столом
      expect(await got).toEqual({ reason: 'order.created' });
      await new Promise((r) => setTimeout(r, 200));
      expect(neighbourEvents).toEqual([]);
    } finally {
      guest.close();
      neighbour.close();
    }
  });
});
