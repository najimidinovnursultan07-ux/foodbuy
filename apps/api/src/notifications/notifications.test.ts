import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import Redis from 'ioredis';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@qrmenu/db';
import { createTableToken, hashPin } from '@qrmenu/shared/server';
import type { ReportDto } from '@qrmenu/shared';
import { bishkekDate, formatSom } from '@qrmenu/shared';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { requireEnv } from '../config/env';
import { NotificationsService } from './notifications.service';

/**
 * Поддельный Telegram Bot API по настоящему HTTP: проверяем весь путь —
 * очередь BullMQ → клиент → «Telegram», и приём обновлений ботом (long polling).
 */
const sent: { chat_id: string; text: string }[] = [];
const pendingUpdates: object[] = [];
let nextUpdateId = 1;
let fake: Server;

function startFakeTelegram(): Promise<number> {
  fake = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const body = raw ? JSON.parse(raw) : {};
      const method = req.url!.split('/').pop();
      const reply = (status: number, json: object) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (!req.url!.startsWith('/bottest-token/')) return reply(401, { ok: false, description: 'Unauthorized' });
      if (method === 'sendMessage') {
        sent.push({ chat_id: String(body.chat_id), text: body.text });
        return reply(200, { ok: true, result: { message_id: sent.length } });
      }
      if (method === 'getUpdates') {
        const deadline = Date.now() + 300;
        while (!pendingUpdates.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
        return reply(200, { ok: true, result: pendingUpdates.splice(0) });
      }
      return reply(404, { ok: false, description: 'Not Found' });
    });
  });
  return new Promise((resolve) => fake.listen(0, '127.0.0.1', () => resolve((fake.address() as AddressInfo).port)));
}

const pushUpdate = (chatId: number, text: string) => pendingUpdates.push({ update_id: nextUpdateId++, message: { text, chat: { id: chatId, type: 'private' } } });
async function waitFor<T>(fn: () => Promise<T> | T, ok: (v: T) => boolean, ms = 8000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (ok(v) || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, 50));
  }
}
const messagesTo = (chat: string) => sent.filter((m) => m.chat_id === chat).map((m) => m.text);

const prisma = new PrismaClient();
const SLUG = 'notify-test';
const MANAGER = '+996555500001';
const CHAT = 4242;
let app: INestApplication;
let token: string;
let rid: string;
let tables: { id: string; token: string; label: string }[] = [];
let plov: string;
const http = () => request(app.getHttpServer());
const asManager = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const port = await startFakeTelegram();
  Object.assign(process.env, {
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_BOT_USERNAME: 'qrmenu_test_bot',
    TELEGRAM_API_BASE: `http://127.0.0.1:${port}`,
    QUEUE_PREFIX: `test-${randomUUID()}`,
    NOTIFICATIONS_SCHEDULER: 'off',
  });
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await redis.del(`login:fail:${MANAGER}`);
  await redis.quit();

  await prisma.restaurant.deleteMany({ where: { slug: SLUG } });
  const r = await prisma.restaurant.create({
    data: { slug: SLUG, name: 'Уведомления', twoGisUrl: 'https://2gis.kg/bishkek/firm/1', orderAlertMinutes: 20, serviceFeeBp: 0 },
  });
  rid = r.id;
  const venue = await prisma.venue.create({ data: { restaurantId: rid, name: 'Зал' } });
  for (const label of ['1', '2']) {
    const t = await prisma.table.create({ data: { restaurantId: rid, venueId: venue.id, label } });
    tables.push({ id: t.id, label, token: createTableToken(t.id, 1, requireEnv('QR_SIGNING_SECRET')) });
  }
  const cat = await prisma.category.create({ data: { restaurantId: rid, name: { ru: 'Еда' } } });
  plov = (await prisma.dish.create({ data: { restaurantId: rid, categoryId: cat.id, name: { ru: 'Плов' }, priceTyiyn: 35000 } })).id;
  await prisma.staff.create({ data: { restaurantId: rid, name: 'Менеджер', phone: MANAGER, pinHash: hashPin('1111'), role: 'manager' } });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  token = (await http().post('/staff/auth/login').send({ phone: MANAGER, pin: '1111' })).body.token;
});

afterAll(async () => {
  await app?.close();
  fake?.close();
  await prisma.restaurant.deleteMany({ where: { slug: SLUG } });
  await prisma.$disconnect();
});

describe('подключение бота', () => {
  it('одноразовая ссылка из панели привязывает чат владельца', async () => {
    expect((await http().get('/admin/telegram').set(asManager()).expect(200)).body).toEqual({ available: true, connected: false, reportHour: 23 });
    const { url } = (await http().post('/admin/telegram/link').set(asManager()).expect(201)).body;
    const code = /^https:\/\/t\.me\/qrmenu_test_bot\?start=([\w-]+)$/.exec(url)![1]!;

    pushUpdate(CHAT, `/start ${code}`);
    const r = await waitFor(() => prisma.restaurant.findUniqueOrThrow({ where: { id: rid } }), (x) => x.telegramChatId === String(CHAT));
    expect(r.telegramChatId).toBe(String(CHAT));
    await waitFor(() => messagesTo(String(CHAT)), (m) => m.length > 0);
    expect(messagesTo(String(CHAT))[0]).toContain('подключён к ресторану «Уведомления»');

    // Повторно ту же ссылку использовать нельзя; чужой чат не перехватит ресторан
    pushUpdate(999, `/start ${code}`);
    await waitFor(() => messagesTo('999'), (m) => m.length > 0);
    expect(messagesTo('999')[0]).toContain('Ссылка устарела');
    expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: rid } })).telegramChatId).toBe(String(CHAT));

    expect((await http().get('/admin/telegram').set(asManager()).expect(200)).body.connected).toBe(true);
  });

  it('тестовое сообщение доходит через очередь', async () => {
    await http().post('/admin/telegram/test').set(asManager()).expect(201);
    await waitFor(() => messagesTo(String(CHAT)), (m) => m.some((t) => t.startsWith('🔔 Проверка')));
  });
});

describe('алерты', () => {
  it('стоп-лист: только при изменении, и «снова в наличии»', async () => {
    const before = sent.length;
    await http().patch(`/admin/dishes/${plov}`).set(asManager()).send({ isAvailable: false }).expect(200);
    await http().patch(`/admin/dishes/${plov}`).set(asManager()).send({ isAvailable: false }).expect(200); // без изменений
    await http().patch(`/admin/dishes/${plov}`).set(asManager()).send({ priceTyiyn: 36000 }).expect(200); // не стоп-лист
    await http().patch(`/admin/dishes/${plov}`).set(asManager()).send({ isAvailable: true }).expect(200);
    const texts = await waitFor(() => sent.slice(before).map((m) => m.text), (t) => t.length >= 2);
    await new Promise((r) => setTimeout(r, 300));
    expect(sent.slice(before).map((m) => m.text).sort()).toEqual(['⛔ В стоп-листе: Плов', '✅ Снова в наличии: Плов'].sort());
    expect(texts.length).toBe(2);
  });

  it('заказ ждёт дольше нормы — один алерт на заказ', async () => {
    const res = await http()
      .post(`/public/orders/${SLUG}/${tables[1]!.token}`)
      .send({ deviceId: randomUUID(), clientRequestId: randomUUID(), items: [{ dishId: plov, selection: {}, quantity: 1 }] })
      .expect(201);
    const notifications = app.get(NotificationsService);
    expect(await notifications.checkLateOrders()).toBe(0); // ещё рано
    await prisma.order.update({ where: { id: res.body.orderId }, data: { createdAt: new Date(Date.now() - 25 * 60_000) } });
    expect(await notifications.checkLateOrders()).toBe(1);
    expect(await notifications.checkLateOrders()).toBe(0);
    await waitFor(() => messagesTo(String(CHAT)), (m) => m.some((t) => t.startsWith('⏰')));
    expect(messagesTo(String(CHAT)).find((t) => t.startsWith('⏰'))).toBe(`⏰ Заказ №${res.body.number}, стол 2 ждёт 25 мин.`);
  });
});

describe('умный отзыв', () => {
  const closedBill = async (tableIdx: number, hoursAgo = 0) =>
    prisma.tableBill.create({
      data: {
        restaurantId: rid,
        tableId: tables[tableIdx]!.id,
        status: 'CLOSED',
        paidWith: 'CASH',
        closedAt: new Date(Date.now() - hoursAgo * 3600_000),
        subtotalTyiyn: 35000,
        totalTyiyn: 35000,
      },
    });
  const status = (t: number, billId: string) =>
    http().get(`/public/reviews/${SLUG}/${tables[t]!.token}/${billId}`).expect(200).then((r) => r.body.canReview as boolean);
  const review = (t: number, body: object) => http().post(`/public/reviews/${SLUG}/${tables[t]!.token}`).send(body);

  it('1–3★ — только владельцу; 4–5★ — ссылка на 2GIS; повтор и чужой стол запрещены', async () => {
    const bad = await closedBill(0);
    expect(await status(0, bad.id)).toBe(true);
    expect(await status(1, bad.id)).toBe(false); // счёт другого стола
    const r1 = await review(0, { billId: bad.id, rating: 2, comment: ' Долго ждали ' }).expect(201);
    expect(r1.body).toEqual({ twoGisUrl: null });
    expect((await review(0, { billId: bad.id, rating: 5 }).expect(409)).body.code).toBe('REVIEW_NOT_ALLOWED');
    expect(await status(0, bad.id)).toBe(false);
    await waitFor(() => messagesTo(String(CHAT)), (m) => m.some((t) => t.startsWith('😟')));
    expect(messagesTo(String(CHAT)).find((t) => t.startsWith('😟'))).toBe('😟 Отзыв ★★☆☆☆ (стол 1)\n«Долго ждали»');

    const good = await closedBill(0);
    const before = sent.length;
    const r2 = await review(0, { billId: good.id, rating: 5 }).expect(201);
    expect(r2.body).toEqual({ twoGisUrl: 'https://2gis.kg/bishkek/firm/1' });
    expect(await prisma.review.findUniqueOrThrow({ where: { billId: good.id } })).toMatchObject({ rating: 5, sentTo2gis: true });
    await new Promise((r) => setTimeout(r, 300));
    expect(sent.length).toBe(before); // хороший отзыв владельца не дёргает

    const old = await closedBill(1, 7);
    expect(await status(1, old.id)).toBe(false);
    await review(1, { billId: old.id, rating: 4 }).expect(409);
    await review(0, { billId: good.id, rating: 6 }).expect(400);
  });

  it('отзывы видны в отчётах панели', async () => {
    const today = bishkekDate();
    const rep = (await http().get(`/admin/reports?from=${today}&to=${today}`).set(asManager()).expect(200)).body as ReportDto;
    expect(rep.reviews).toMatchObject({ count: 2, avgRating: 3.5, lowCount: 1 });
    expect(rep.reviews.recent.map((r) => r.rating)).toEqual([5, 2]);
    expect(rep.reviews.recent[1]).toMatchObject({ comment: 'Долго ждали', tableLabel: '1' });
  });
});

describe('вечерний отчёт', () => {
  it('приходит в выбранный час, один раз в день', async () => {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bishkek', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    await prisma.restaurant.update({ where: { id: rid }, data: { reportHour: (hour + 1) % 24 } });
    const notifications = app.get(NotificationsService);
    expect(await notifications.sendEveningReports()).toBe(0); // не его час
    await prisma.restaurant.update({ where: { id: rid }, data: { reportHour: hour } });
    expect(await notifications.sendEveningReports()).toBe(1);
    expect(await notifications.sendEveningReports()).toBe(0);
    const text = (await waitFor(() => messagesTo(String(CHAT)), (m) => m.some((t) => t.startsWith('📊')))).find((t) => t.startsWith('📊'))!;
    expect(text).toContain(`📊 «Уведомления», ${bishkekDate()}`);
    // Сумма должна совпасть с отчётом панели за тот же день (сколько счетов «сегодня» — зависит от часа запуска)
    const today = bishkekDate();
    const rep = (await http().get(`/admin/reports?from=${today}&to=${today}`).set(asManager()).expect(200)).body as ReportDto;
    expect(rep.revenueTyiyn).toBeGreaterThan(0);
    expect(text).toContain(`Выручка: ${formatSom(rep.revenueTyiyn)}`);
    expect(text).toContain('Отзывы: 2, средняя 3.5★, плохих: 1');
  });
});

describe('отключение и вебхук', () => {
  it('после отключения сообщения не уходят; вебхук без секрета закрыт', async () => {
    await http().delete('/admin/telegram').set(asManager()).expect(200);
    expect((await http().get('/admin/telegram').set(asManager()).expect(200)).body.connected).toBe(false);
    await http().post('/admin/telegram/test').set(asManager()).expect(409);
    await http().post('/telegram/webhook').send({ update_id: 1 }).expect(401);
  });
});
