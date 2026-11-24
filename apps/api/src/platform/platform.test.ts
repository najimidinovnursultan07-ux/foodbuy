import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@qrmenu/db';
import { bishkekDate, type AdminTableDto, type PlatformRestaurantDto } from '@qrmenu/shared';
import { hashPin } from '@qrmenu/shared/server';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';

const prisma = new PrismaClient();
const ADMIN = '+996555400001';
const MANAGER = '+996555400002';
const SLUG = 'platform-new-test';
let app: INestApplication;
let token: string;
let planId: string;
const http = () => request(app.getHttpServer());
const asAdmin = () => ({ Authorization: `Bearer ${token}` });
const find = async () =>
  ((await http().get('/platform/restaurants').set(asAdmin()).expect(200)).body as PlatformRestaurantDto[]).find((r) => r.slug === SLUG)!;

beforeAll(async () => {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await redis.del(`plogin:fail:${ADMIN}`, `login:fail:${MANAGER}`);
  await redis.quit();
  await prisma.restaurant.deleteMany({ where: { slug: SLUG } });
  await prisma.plan.deleteMany({ where: { code: 'test-pro' } });
  await prisma.platformAdmin.deleteMany({ where: { phone: ADMIN } });
  await prisma.platformAdmin.create({ data: { name: 'Админ платформы', phone: ADMIN, pinHash: hashPin('777777') } });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await prisma.restaurant.deleteMany({ where: { slug: SLUG } });
  await prisma.plan.deleteMany({ where: { code: 'test-pro' } });
  await prisma.platformAdmin.deleteMany({ where: { phone: ADMIN } });
  await prisma.$disconnect();
});

describe('вход в супер-админку', () => {
  it('только сотрудник платформы; токены ресторана и платформы не взаимозаменяемы', async () => {
    await http().post('/platform/auth/login').send({ phone: ADMIN, pin: '000000' }).expect(401);
    await http().get('/platform/restaurants').expect(401);
    const res = await http().post('/platform/auth/login').send({ phone: '0555 400 001', pin: '777777' }).expect(200);
    token = res.body.token;
    expect(res.body.admin.name).toBe('Админ платформы');

    const demoManager = (await http().post('/staff/auth/login').send({ phone: '+996700000001', pin: '1234' })).body.token;
    await http().get('/platform/restaurants').set({ Authorization: `Bearer ${demoManager}` }).expect(401);
    await http().get('/admin/menu').set(asAdmin()).expect(401);
  });
});

describe('рестораны и подписки', () => {
  it('тарифы: создание и список', async () => {
    planId = (await http().post('/platform/plans').set(asAdmin()).send({ code: 'test-pro', name: 'Про', priceTyiyn: 500000, maxTables: 60, isActive: true }).expect(201)).body.id;
    await http().post('/platform/plans').set(asAdmin()).send({ code: 'test-pro', name: 'Дубль', priceTyiyn: 1, maxTables: null, isActive: true }).expect(409);
    const plans = (await http().get('/platform/plans').set(asAdmin()).expect(200)).body as { code: string }[];
    expect(plans.map((p) => p.code)).toContain('test-pro');
  });

  it('новый ресторан «под ключ»: менеджер входит в панель, пробный период', async () => {
    const body = { name: 'Новое кафе', slug: SLUG, managerName: 'Айбек', managerPhone: '0555 400 002', managerPin: '2468', planId, trialDays: 14 };
    await http().post('/platform/restaurants').set(asAdmin()).send(body).expect(201);
    expect((await http().post('/platform/restaurants').set(asAdmin()).send(body).expect(409)).body.code).toBe('SLUG_TAKEN');
    await http().post('/platform/restaurants').set(asAdmin()).send({ ...body, slug: 'Bad Slug!' }).expect(400);

    const r = await find();
    const trialEnd = bishkekDate(new Date(Date.now() + 13 * 86_400_000));
    expect(r).toMatchObject({ name: 'Новое кафе', status: 'ACTIVE', staffCount: 1, subscription: { status: 'TRIAL', planName: 'Про', periodEnd: trialEnd, expired: false } });

    const mgr = (await http().post('/staff/auth/login').send({ phone: MANAGER, pin: '2468' }).expect(200)).body.token;
    await http().post('/admin/tables').set({ Authorization: `Bearer ${mgr}` }).send({ labels: ['1'] }).expect(201);
  });

  it('подписка ставится вручную, просрочка видна; история сохраняется', async () => {
    const r = await find();
    await http().put(`/platform/restaurants/${r.id}/subscription`).set(asAdmin()).send({ planId, status: 'ACTIVE', periodEnd: '2099-12-31', note: 'Оплата наличными' }).expect(200);
    expect((await find()).subscription).toMatchObject({ status: 'ACTIVE', periodEnd: '2099-12-31', note: 'Оплата наличными', expired: false });
    await http().put(`/platform/restaurants/${r.id}/subscription`).set(asAdmin()).send({ planId, status: 'PAST_DUE', periodEnd: '2020-01-31' }).expect(200);
    expect((await find()).subscription).toMatchObject({ status: 'PAST_DUE', expired: true });
    expect(await prisma.subscription.count({ where: { restaurantId: r.id } })).toBe(3);
    await http().put(`/platform/restaurants/${r.id}/subscription`).set(asAdmin()).send({ planId, status: 'PAID', periodEnd: '2020-01-31' }).expect(400);
  });

  it('блокировка: «только меню» выключает заказы, «отключён» — меню и вход персонала', async () => {
    const r = await find();
    const mgr = (await http().post('/staff/auth/login').send({ phone: MANAGER, pin: '2468' }).expect(200)).body.token;
    const [table] = (await http().get('/admin/tables').set({ Authorization: `Bearer ${mgr}` }).expect(200)).body as AdminTableDto[];
    const path = new URL(table!.url).pathname.replace(/^\/m\//, '');

    await http().patch(`/platform/restaurants/${r.id}`).set(asAdmin()).send({ status: 'MENU_ONLY' }).expect(200);
    expect((await http().get(`/public/menu/${path}`).expect(200)).body.restaurant.status).toBe('MENU_ONLY');
    const order = await http().post(`/public/orders/${path}`).send({ deviceId: randomUUID(), clientRequestId: randomUUID(), items: [{ dishId: 'x', selection: {}, quantity: 1 }] }).expect(403);
    expect(order.body.code).toBe('ORDERING_DISABLED');
    await http().get('/admin/menu').set({ Authorization: `Bearer ${mgr}` }).expect(200); // персонал работает

    await http().patch(`/platform/restaurants/${r.id}`).set(asAdmin()).send({ status: 'DISABLED' }).expect(200);
    await http().get(`/public/menu/${path}`).expect(403);
    await http().get('/admin/menu').set({ Authorization: `Bearer ${mgr}` }).expect(401);
    await http().post('/staff/auth/login').send({ phone: MANAGER, pin: '2468' }).expect(401);

    await http().patch(`/platform/restaurants/${r.id}`).set(asAdmin()).send({ status: 'ACTIVE' }).expect(200);
    await http().get(`/public/menu/${path}`).expect(200);
    await http().patch(`/platform/restaurants/${r.id}`).set(asAdmin()).send({ status: 'BANNED' }).expect(400);
  });
});
