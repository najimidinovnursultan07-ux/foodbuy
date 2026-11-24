import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Redis from 'ioredis';
import { PrismaClient } from '@qrmenu/db';
import { createTableToken, hashPin } from '@qrmenu/shared/server';
import type { CreateOrderLine, GuestBillDto, KitchenBoardDto, WaiterFeedDto } from '@qrmenu/shared';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { requireEnv } from '../config/env';

const prisma = new PrismaClient();
const secret = requireEnv('QR_SIGNING_SECRET');
const SLUG = 'staff-flow-test';
const OTHER = 'staff-flow-other';
const PH = {
  waiter: '+996555100001',
  cook: '+996555100002',
  bar: '+996555100003',
  manager: '+996555100004',
  fired: '+996555100005',
  locked: '+996555100006',
  otherWaiter: '+996555100007',
};

let app: INestApplication;
let baseUrl: string;
let rid: string;
const tables: { id: string; token: string }[] = [];
let lagman: string;
let tea: string;
const tok: Record<string, string> = {};

const http = () => request(app.getHttpServer());
const login = (phone: string, pin: string, extra: object = {}) => http().post('/staff/auth/login').send({ phone, pin, ...extra });
const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
const board = async (who: string, station?: string) =>
  (await http().get(`/staff/kitchen${station ? `?station=${station}` : ''}`).set(as(who)).expect(200)).body as KitchenBoardDto;
const feed = async (who = 'waiter') => (await http().get('/staff/waiter/feed').set(as(who)).expect(200)).body as WaiterFeedDto;
const guestOrder = async (t: number, items: CreateOrderLine[]) =>
  (
    await http()
      .post(`/public/orders/${SLUG}/${tables[t]!.token}`)
      .send({ deviceId: randomUUID(), clientRequestId: randomUUID(), items })
      .expect(201)
  ).body as { orderId: string; billId: string; status: string };
const guestBill = async (t: number) => (await http().get(`/public/bill/${SLUG}/${tables[t]!.token}`).expect(200)).body as GuestBillDto;
const ticket = (who: string, orderId: string, station: string, action: string) =>
  http().post(`/staff/kitchen/tickets/${orderId}/${station}/${action}`).set(as(who));
const LAGMAN: CreateOrderLine = { dishId: '', selection: {}, quantity: 2 };

beforeAll(async () => {
  // Счётчики неудачных входов с прошлых прогонов живут 15 минут — сбрасываем
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await redis.del(...[...Object.values(PH), '+996999999999'].map((p) => `login:fail:${p}`));
  await redis.quit();
  await prisma.restaurant.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const r = await prisma.restaurant.create({ data: { slug: SLUG, name: 'Персонал-тест', serviceFeeBp: 1000 } });
  rid = r.id;
  const venue = await prisma.venue.create({ data: { restaurantId: r.id, name: 'Зал' } });
  for (let i = 1; i <= 6; i++) {
    const t = await prisma.table.create({ data: { restaurantId: r.id, venueId: venue.id, label: String(i) } });
    tables.push({ id: t.id, token: createTableToken(t.id, 1, secret) });
  }
  const cat = await prisma.category.create({ data: { restaurantId: r.id, name: { ru: 'Еда' } } });
  lagman = (await prisma.dish.create({ data: { restaurantId: r.id, categoryId: cat.id, name: { ru: 'Лагман' }, priceTyiyn: 32000 } })).id;
  tea = (await prisma.dish.create({ data: { restaurantId: r.id, categoryId: cat.id, name: { ru: 'Чай' }, priceTyiyn: 10000, station: 'BAR' } })).id;
  LAGMAN.dishId = lagman;

  const pin = hashPin('1111');
  await prisma.staff.createMany({
    data: [
      { restaurantId: r.id, name: 'Официант', phone: PH.waiter, pinHash: pin, role: 'waiter' },
      { restaurantId: r.id, name: 'Повар', phone: PH.cook, pinHash: pin, role: 'kitchen', station: 'KITCHEN' },
      { restaurantId: r.id, name: 'Бармен', phone: PH.bar, pinHash: pin, role: 'kitchen', station: 'BAR' },
      { restaurantId: r.id, name: 'Менеджер', phone: PH.manager, pinHash: pin, role: 'manager' },
      { restaurantId: r.id, name: 'Уволен', phone: PH.fired, pinHash: pin, role: 'waiter', isActive: false },
      { restaurantId: r.id, name: 'Блок', phone: PH.locked, pinHash: pin, role: 'waiter' },
    ],
  });
  const o = await prisma.restaurant.create({ data: { slug: OTHER, name: 'Чужой' } });
  await prisma.staff.create({ data: { restaurantId: o.id, name: 'Чужой официант', phone: PH.otherWaiter, pinHash: pin, role: 'waiter' } });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.listen(0);
  baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');

  for (const [who, phone] of [['waiter', PH.waiter], ['cook', PH.cook], ['bar', PH.bar], ['manager', PH.manager], ['other', PH.otherWaiter]] as const) {
    tok[who] = (await login(phone, '1111').expect(200)).body.token;
  }
});

afterAll(async () => {
  await app?.close();
  await prisma.restaurant.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  await prisma.$disconnect();
});

describe('вход персонала', () => {
  it('телефон в любом формате + PIN → токен и профиль', async () => {
    const res = await login('0555 100 001', '1111').expect(200);
    expect(res.body.staff).toMatchObject({ name: 'Официант', role: 'waiter', restaurant: { slug: SLUG } });
    expect((await http().get('/staff/me').set({ Authorization: `Bearer ${res.body.token}` }).expect(200)).body.id).toBe(
      res.body.staff.id,
    );
  });

  it('неверный PIN, уволенный, неизвестный номер — 401', async () => {
    expect((await login(PH.waiter, '9999').expect(401)).body.code).toBe('INVALID_CREDENTIALS');
    await login(PH.fired, '1111').expect(401);
    await login('+996999999999', '1111').expect(401);
    await login(PH.waiter, '12').expect(400);
  });

  it('после 5 неудачных попыток номер блокируется даже с верным PIN', async () => {
    for (let i = 0; i < 5; i++) await login(PH.locked, '0000').expect(401);
    expect((await login(PH.locked, '1111').expect(429)).body.code).toBe('RATE_LIMITED');
  });

  it('роли и отзыв сессии', async () => {
    await http().get('/staff/waiter/feed').expect(401);
    await http().get('/staff/waiter/feed').set({ Authorization: 'Bearer forged.token' }).expect(401);
    await http().get('/staff/kitchen').set(as('waiter')).expect(403);
    await http().get('/staff/waiter/feed').set(as('cook')).expect(403);
    await http().get('/staff/kitchen?station=BAR').set(as('cook')).expect(403); // чужой цех
    await http().get('/staff/kitchen?station=BAR').set(as('manager')).expect(200);

    // Смена PIN и увольнение сразу обрывают старые сессии
    const t = (await login(PH.manager, '1111').expect(200)).body.token;
    await prisma.staff.updateMany({ where: { phone: PH.manager }, data: { pinHash: hashPin('2222') } });
    await http().get('/staff/me').set({ Authorization: `Bearer ${t}` }).expect(401);
    const t2 = (await login(PH.manager, '2222').expect(200)).body.token;
    await prisma.staff.updateMany({ where: { phone: PH.manager }, data: { isActive: false } });
    await http().get('/staff/me').set({ Authorization: `Bearer ${t2}` }).expect(401);
    await prisma.staff.updateMany({ where: { phone: PH.manager }, data: { isActive: true, pinHash: hashPin('1111') } });
    tok.manager = (await login(PH.manager, '1111').expect(200)).body.token;
  });
});

describe('кухня → официант → гость', () => {
  it('цеха получают свои позиции, статус заказа собирается из цехов, гость видит изменения', async () => {
    const { orderId } = await guestOrder(0, [LAGMAN, { dishId: tea, selection: {}, quantity: 1 }]);

    const kitchen = await board('cook');
    const kt = kitchen.tickets.find((t) => t.orderId === orderId)!;
    expect(kitchen).toMatchObject({ station: 'KITCHEN', canSwitchStation: false });
    expect(kt).toMatchObject({ status: 'NEW', tableLabel: '1', items: [{ name: { ru: 'Лагман' }, quantity: 2 }] });
    const bar = await board('bar');
    expect(bar.tickets.find((t) => t.orderId === orderId)!.items.map((i) => i.name.ru)).toEqual(['Чай']);

    await ticket('cook', orderId, 'KITCHEN', 'start').expect(200);
    expect((await guestBill(0)).bill!.orders[0]!.status).toBe('IN_PROGRESS');
    await ticket('cook', orderId, 'KITCHEN', 'start').expect(409); // уже начат
    await ticket('cook', orderId, 'BAR', 'ready').expect(403); // повар не трогает бар

    // Бар отдал чай — официант видит «готово — забрать» только чай, заказ ещё готовится
    await ticket('bar', orderId, 'BAR', 'ready').expect(200);
    let f = await feed();
    expect(f.ready.find((r) => r.orderId === orderId)!.items.map((i) => i.name.ru)).toEqual(['Чай']);
    expect((await guestBill(0)).bill!.orders[0]!.status).toBe('IN_PROGRESS');

    // Повар ошибся и вернул, потом отдал
    await ticket('cook', orderId, 'KITCHEN', 'ready').expect(200);
    expect((await board('cook')).tickets.find((t) => t.orderId === orderId)!.status).toBe('READY');
    await ticket('cook', orderId, 'KITCHEN', 'back').expect(200);
    expect((await board('cook')).tickets.find((t) => t.orderId === orderId)!.status).toBe('IN_PROGRESS');
    await ticket('cook', orderId, 'KITCHEN', 'ready').expect(200);
    expect((await guestBill(0)).bill!.orders[0]!.status).toBe('READY');

    await http().post(`/staff/orders/${orderId}/served`).set(as('waiter')).expect(200);
    expect((await guestBill(0)).bill!.orders[0]!.status).toBe('SERVED');
    expect((await board('cook')).tickets.some((t) => t.orderId === orderId)).toBe(false);
    f = await feed();
    expect(f.ready.some((r) => r.orderId === orderId)).toBe(false);
    expect(f.bills.find((b) => b.tableLabel === '1')).toMatchObject({ hasUnserved: false, totals: { totalTyiyn: 81400 } });
  });

  it('режим «сначала официант»: на кухню попадает только подтверждённое, отклонённое не в счёте', async () => {
    await prisma.restaurant.update({ where: { id: rid }, data: { orderFlow: 'WAITER_CONFIRM' } });
    try {
      const a = await guestOrder(1, [LAGMAN]);
      const b = await guestOrder(1, [{ dishId: tea, selection: {}, quantity: 3 }]);
      expect(a.status).toBe('PENDING_CONFIRMATION');
      expect((await feed()).pending.map((p) => p.id)).toEqual(expect.arrayContaining([a.orderId, b.orderId]));
      expect((await board('cook')).tickets.some((t) => t.orderId === a.orderId)).toBe(false);

      await http().post(`/staff/orders/${a.orderId}/confirm`).set(as('waiter')).expect(200);
      await http().post(`/staff/orders/${a.orderId}/confirm`).set(as('waiter')).expect(409);
      expect((await board('cook')).tickets.some((t) => t.orderId === a.orderId)).toBe(true);

      await http().post(`/staff/orders/${b.orderId}/reject`).set(as('waiter')).expect(200);
      const bill = (await guestBill(1)).bill!;
      expect(bill.orders.map((o) => o.status)).toEqual(['NEW', 'CANCELLED']);
      expect(bill.totals.subtotalTyiyn).toBe(64000);

      await ticket('cook', a.orderId, 'KITCHEN', 'start').expect(200);
      await http().post(`/staff/orders/${a.orderId}/reject`).set(as('waiter')).expect(409); // уже готовится
    } finally {
      await prisma.restaurant.update({ where: { id: rid }, data: { orderFlow: 'DIRECT_TO_KITCHEN' } });
    }
  });
});

describe('вызовы и закрытие счёта', () => {
  it('официант принимает вызов, закрывает счёт; следующий заказ открывает новый счёт', async () => {
    await guestOrder(2, [LAGMAN]);
    await http().post(`/public/calls/${SLUG}/${tables[2]!.token}`).send({ type: 'BRING_BILL', paymentMethod: 'CARD' }).expect(201);
    await http().post(`/public/calls/${SLUG}/${tables[2]!.token}`).send({ type: 'CALL_WAITER' }).expect(201);

    let f = await feed();
    const calls = f.calls.filter((c) => c.tableLabel === '3');
    expect(calls.map((c) => [c.type, c.paymentMethod, c.status])).toEqual([
      ['BRING_BILL', 'CARD', 'OPEN'],
      ['CALL_WAITER', null, 'OPEN'],
    ]);
    const waiterCall = calls[1]!;
    await http().post(`/staff/calls/${waiterCall.id}/ack`).set(as('waiter')).expect(200);
    await http().post(`/staff/calls/${waiterCall.id}/ack`).set(as('waiter')).expect(409);
    f = await feed();
    expect(f.calls.find((c) => c.id === waiterCall.id)).toMatchObject({ status: 'ACKNOWLEDGED', handledByMe: true });
    await http().post(`/staff/calls/${waiterCall.id}/done`).set(as('waiter')).expect(200);

    // Ещё один заказ ждёт подтверждения — при закрытии он отменяется
    await prisma.restaurant.update({ where: { id: rid }, data: { orderFlow: 'WAITER_CONFIRM' } });
    await guestOrder(2, [{ dishId: tea, selection: {}, quantity: 1 }]);
    await prisma.restaurant.update({ where: { id: rid }, data: { orderFlow: 'DIRECT_TO_KITCHEN' } });

    const bill = (await feed()).bills.find((b) => b.tableLabel === '3')!;
    expect(bill.requestedPayment).toBe('CARD');
    await http().post(`/staff/bills/${bill.id}/close`).set(as('waiter')).send({ paidWith: 'BANK' }).expect(400);
    const closed = await http().post(`/staff/bills/${bill.id}/close`).set(as('waiter')).send({ paidWith: 'CASH' }).expect(200);
    expect(closed.body).toMatchObject({ status: 'CLOSED', totalTyiyn: 70400 }); // 640 + 10%, отменённый чай не считается
    await http().post(`/staff/bills/${bill.id}/close`).set(as('waiter')).send({ paidWith: 'CASH' }).expect(409);

    const stored = await prisma.tableBill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(stored).toMatchObject({ paidWith: 'CASH', subtotalTyiyn: 64000, serviceFeeTyiyn: 6400, totalTyiyn: 70400 });
    expect(await prisma.waiterCall.count({ where: { tableId: tables[2]!.id, status: { not: 'DONE' } } })).toBe(0);

    const g = await guestBill(2);
    expect(g.bill).toBeNull();
    expect(g.openCalls).toEqual([]);
    const next = await guestOrder(2, [LAGMAN]);
    expect(next.billId).not.toBe(bill.id);
  });
});

describe('изоляция ресторанов', () => {
  it('официант другого ресторана ничего не видит и не может изменить', async () => {
    const { orderId, billId } = await guestOrder(3, [LAGMAN]);
    const f = await feed('other');
    expect(f.bills).toEqual([]);
    expect(f.calls).toEqual([]);
    await http().post(`/staff/orders/${orderId}/reject`).set(as('other')).expect(409);
    await http().post(`/staff/bills/${billId}/close`).set(as('other')).send({ paidWith: 'CASH' }).expect(409);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ status: 'NEW' });
  });
});

describe('WebSocket персонала', () => {
  const connect = () =>
    new Promise<Socket>((resolve, reject) => {
      const s = io(baseUrl, { transports: ['websocket'], forceNew: true });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });

  it('персонал ресторана получает новые заказы, чужой — нет', async () => {
    const mine = await connect();
    const foreign = await connect();
    try {
      expect(await mine.emitWithAck('staff:join', { token: 'forged' })).toEqual({ ok: false });
      expect(await mine.emitWithAck('staff:join', { token: tok.cook })).toEqual({ ok: true });
      expect(await foreign.emitWithAck('staff:join', { token: tok.other })).toEqual({ ok: true });
      const foreignEvents: unknown[] = [];
      foreign.onAny((e) => foreignEvents.push(e));

      const got = new Promise<{ orderId: string }>((resolve) => mine.once('order.created', resolve));
      const { orderId } = await guestOrder(4, [LAGMAN]);
      expect((await got).orderId).toBe(orderId);

      const updated = new Promise<{ status: string }>((resolve) => mine.once('order.updated', resolve));
      await ticket('cook', orderId, 'KITCHEN', 'start').expect(200);
      expect((await updated).status).toBe('IN_PROGRESS');

      await new Promise((r) => setTimeout(r, 200));
      expect(foreignEvents).toEqual([]);
    } finally {
      mine.close();
      foreign.close();
    }
  });
});
