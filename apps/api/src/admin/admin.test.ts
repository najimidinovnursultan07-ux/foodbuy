import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import sharp from 'sharp';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@qrmenu/db';
import { hashPin } from '@qrmenu/shared/server';
import type { AdminMenuDto, AdminStaffDto, AdminTableDto, PublicMenuDto, ReportDto, SettingsDto } from '@qrmenu/shared';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';

const prisma = new PrismaClient();
const SLUG = 'admin-flow-test';
const OTHER = 'admin-flow-other';
const PH = { manager: '+996555200001', waiter: '+996555200002', other: '+996555200003', newbie: '+996555200004' };

let app: INestApplication;
const tok: Record<string, string> = {};
const http = () => request(app.getHttpServer());
const as = (who: string) => ({ Authorization: `Bearer ${tok[who]}` });
const login = async (phone: string, pin: string) => (await http().post('/staff/auth/login').send({ phone, pin })).body.token as string;
const menu = async () => (await http().get('/admin/menu').set(as('manager')).expect(200)).body as AdminMenuDto;
const tables = async () => (await http().get('/admin/tables').set(as('manager')).expect(200)).body as AdminTableDto[];
const guestPath = (url: string) => new URL(url).pathname.replace(/^\/m\//, '');
const guestMenu = async (url: string) => (await http().get(`/public/menu/${guestPath(url)}`).expect(200)).body as PublicMenuDto;

const dishBody = (categoryId: string, over: object = {}) => ({
  categoryId,
  name: { ru: 'Самса', ky: 'Самса', en: '' },
  description: { ru: 'С тыквой', ky: '', en: '' },
  priceTyiyn: 9000,
  weightValue: 1,
  weightUnit: 'PCS',
  station: 'KITCHEN',
  isHit: false,
  isSpicy: false,
  isHalal: true,
  isAvailable: true,
  isActive: true,
  ...over,
});

beforeAll(async () => {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  await redis.del(...Object.values(PH).map((p) => `login:fail:${p}`));
  await redis.quit();
  await prisma.restaurant.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const r = await prisma.restaurant.create({ data: { slug: SLUG, name: 'Панель-тест', serviceFeeBp: 1000 } });
  await prisma.venue.create({ data: { restaurantId: r.id, name: 'Зал' } });
  const pin = hashPin('1111');
  await prisma.staff.createMany({
    data: [
      { restaurantId: r.id, name: 'Менеджер', phone: PH.manager, pinHash: pin, role: 'manager' },
      { restaurantId: r.id, name: 'Официант', phone: PH.waiter, pinHash: pin, role: 'waiter' },
    ],
  });
  const o = await prisma.restaurant.create({ data: { slug: OTHER, name: 'Чужой' } });
  await prisma.staff.create({ data: { restaurantId: o.id, name: 'Чужой менеджер', phone: PH.other, pinHash: pin, role: 'manager' } });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  tok.manager = await login(PH.manager, '1111');
  tok.waiter = await login(PH.waiter, '1111');
  tok.other = await login(PH.other, '1111');
});

afterAll(async () => {
  await app?.close();
  await prisma.restaurant.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  await prisma.$disconnect();
});

describe('доступ', () => {
  it('панель — только менеджеру', async () => {
    await http().get('/admin/menu').expect(401);
    await http().get('/admin/menu').set(as('waiter')).expect(403);
    await http().get('/admin/menu').set(as('manager')).expect(200);
  });
});

let catA: string;
let catB: string;
let samsa: string;
let tableUrl: string;

describe('столы и QR', () => {
  it('создаёт столы, ссылка открывает меню, дубль номера — 409', async () => {
    await http().post('/admin/tables').set(as('manager')).send({ labels: ['1', '2', '3', 'Терраса'] }).expect(201);
    const res = await http().post('/admin/tables').set(as('manager')).send({ labels: ['3', '4'] }).expect(409);
    expect(res.body).toMatchObject({ code: 'LABEL_TAKEN', labels: ['3'] });
    const list = await tables();
    expect(list.map((t) => t.label)).toEqual(['1', '2', '3', 'Терраса']);
    tableUrl = list[0]!.url;
    expect(tableUrl).toMatch(/^http:\/\/localhost:3000\/m\/admin-flow-test\//);
    expect((await guestMenu(tableUrl)).table.label).toBe('1');
  });

  it('перевыпуск QR: старая ссылка перестаёт работать', async () => {
    const [t] = await tables();
    await http().post(`/admin/tables/${t!.id}/reissue`).set(as('manager')).expect(201);
    await http().get(`/public/menu/${guestPath(t!.url)}`).expect(404);
    tableUrl = (await tables())[0]!.url;
    await guestMenu(tableUrl);
  });

  it('PDF с QR: A4, по 6 на лист, только активные столы', async () => {
    const list = await tables();
    await http().patch(`/admin/tables/${list[3]!.id}`).set(as('manager')).send({ isActive: false }).expect(200);
    const pdf = await http().get('/admin/tables/qr.pdf').set(as('manager')).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const body = pdf.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
    await http().get(`/admin/tables/qr.pdf?ids=${list[0]!.id}`).set(as('manager')).expect(200);
    await http().get('/admin/tables/qr.pdf').set(as('other')).expect(404); // у чужого ресторана столов нет
  });
});

describe('меню', () => {
  it('категории и блюда: создание, пустые переводы отбрасываются, гость видит изменения', async () => {
    catA = (await http().post('/admin/categories').set(as('manager')).send({ name: { ru: 'Выпечка', ky: 'Нан азыктары', en: '' } }).expect(201)).body.id;
    catB = (await http().post('/admin/categories').set(as('manager')).send({ name: { ru: 'Напитки' } }).expect(201)).body.id;
    samsa = (await http().post('/admin/dishes').set(as('manager')).send(dishBody(catA)).expect(201)).body.id;
    await http().post('/admin/dishes').set(as('manager')).send(dishBody(catA, { priceTyiyn: -1 })).expect(400);
    await http().post('/admin/dishes').set(as('manager')).send(dishBody('nope')).expect(404);

    let m = await menu();
    expect(m.categories.map((c) => c.name)).toEqual([{ ru: 'Выпечка', ky: 'Нан азыктары' }, { ru: 'Напитки' }]);
    expect(m.dishes[samsa]).toMatchObject({ name: { ru: 'Самса', ky: 'Самса' }, description: { ru: 'С тыквой' }, priceTyiyn: 9000 });

    await http().patch(`/admin/dishes/${samsa}`).set(as('manager')).send({ priceTyiyn: 9500, description: null }).expect(200);
    await http().post('/admin/categories/reorder').set(as('manager')).send({ ids: [catB, catA] }).expect(201);
    m = await menu();
    expect(m.dishes[samsa]).toMatchObject({ priceTyiyn: 9500, description: null });
    expect(m.categories[0]!.id).toBe(catB);

    const g = await guestMenu(tableUrl);
    expect(g.dishes[samsa]!.priceTyiyn).toBe(9500);
    expect(g.categories.map((c) => c.id)).toEqual([catA]); // пустая категория «Напитки» гостю не видна

    expect((await http().delete(`/admin/categories/${catA}`).set(as('manager')).expect(409)).body.code).toBe('CATEGORY_NOT_EMPTY');
  });

  it('модификаторы: id сохраняются при правке, неверные группы и чужие id отклоняются', async () => {
    const put = (body: object) => http().put(`/admin/dishes/${samsa}/modifiers`).set(as('manager')).send(body);
    const group = (mods: object[], over: object = {}) => ({ name: { ru: 'Соус' }, minSelect: 0, maxSelect: 2, modifiers: mods, ...over });
    const mod = (ru: string, over: object = {}) => ({ name: { ru }, priceDeltaTyiyn: 2000, isDefault: false, isAvailable: true, ...over });

    await put({ groups: [group([mod('Сметана'), mod('Чесночный')])] }).expect(200);
    let g = (await menu()).dishes[samsa]!.modifierGroups;
    const [sour, garlic] = g[0]!.modifiers;

    await put({ groups: [{ ...group([{ ...mod('Сметана+'), id: sour!.id }, mod('Острый')]), id: g[0]!.id }] }).expect(200);
    g = (await menu()).dishes[samsa]!.modifierGroups;
    expect(g[0]!.modifiers.map((m) => [m.name.ru, m.id === sour!.id])).toEqual([
      ['Сметана+', true],
      ['Острый', false],
    ]);
    expect(await prisma.modifier.count({ where: { id: garlic!.id } })).toBe(0);

    await put({ groups: [group([mod('A')], { minSelect: 2, maxSelect: 1 })] }).expect(400);
    await put({ groups: [group([mod('A', { isDefault: true }), mod('B', { isDefault: true })], { maxSelect: 1 })] }).expect(400);
    await put({ groups: [group([{ ...mod('X'), id: 'someone-elses-id' }])] }).expect(400);

    // Стоп-лист модификатора
    await http().patch(`/admin/modifiers/${sour!.id}`).set(as('manager')).send({ isAvailable: false }).expect(200);
    const gm = (await guestMenu(tableUrl)).dishes[samsa]!.modifierGroups[0]!.modifiers;
    expect(gm.find((m) => m.id === sour!.id)!.isAvailable).toBe(false);
  });

  it('«к этому берут» и стоп-лист блюда', async () => {
    const tea = (await http().post('/admin/dishes').set(as('manager')).send(dishBody(catB, { name: { ru: 'Чай' }, station: 'BAR' })).expect(201)).body.id;
    await http().put(`/admin/dishes/${samsa}/upsells`).set(as('manager')).send({ dishIds: [tea, samsa] }).expect(200);
    expect((await menu()).dishes[samsa]!.upsellIds).toEqual([tea]); // само себя не предлагаем

    const foreignDish = await prisma.dish.create({
      data: {
        restaurant: { connect: { slug: OTHER } },
        category: { create: { restaurant: { connect: { slug: OTHER } }, name: { ru: 'X' } } },
        name: { ru: 'Чужое' },
        priceTyiyn: 1,
      },
    });
    await http().put(`/admin/dishes/${samsa}/upsells`).set(as('manager')).send({ dishIds: [foreignDish.id] }).expect(404);

    await http().patch(`/admin/dishes/${tea}`).set(as('manager')).send({ isAvailable: false }).expect(200);
    expect((await guestMenu(tableUrl)).dishes[tea]!.isAvailable).toBe(false);
    await http().patch(`/admin/dishes/${tea}`).set(as('manager')).send({ isActive: false }).expect(200);
    const g = await guestMenu(tableUrl);
    expect(g.dishes[tea]).toBeUndefined(); // скрытое блюдо гостю не отдаём
    expect(g.dishes[samsa]!.upsellIds).toEqual([]);
  });

  it('фото: WebP 960×720 и миниатюра 176×176, не-картинка отклоняется', async () => {
    const jpeg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#c2410c' } }).jpeg().toBuffer();
    const res = await http().post(`/admin/dishes/${samsa}/photo`).set(as('manager')).attach('file', jpeg, 'samsa.jpg').expect(201);
    const { photoUrl, photoThumbUrl } = res.body as { photoUrl: string; photoThumbUrl: string };
    const fetchImg = async (url: string) => {
      const r = await http().get(new URL(url).pathname).buffer(true).parse((resp, cb) => {
        const c: Buffer[] = [];
        resp.on('data', (x: Buffer) => c.push(x));
        resp.on('end', () => cb(null, Buffer.concat(c)));
      }).expect(200);
      expect(r.headers['cache-control']).toContain('immutable');
      return sharp(r.body as Buffer).metadata();
    };
    expect(await fetchImg(photoUrl)).toMatchObject({ format: 'webp', width: 960, height: 720 });
    expect(await fetchImg(photoThumbUrl)).toMatchObject({ format: 'webp', width: 176, height: 176 });
    expect((await guestMenu(tableUrl)).dishes[samsa]!.photoThumbUrl).toBe(photoThumbUrl);

    const bad = await http().post(`/admin/dishes/${samsa}/photo`).set(as('manager')).attach('file', Buffer.from('not an image'), 'x.jpg').expect(400);
    expect(bad.body.code).toBe('INVALID_IMAGE');

    await http().delete(`/admin/dishes/${samsa}/photo`).set(as('manager')).expect(200);
    await http().get(new URL(photoUrl).pathname).expect(404); // файл удалён
  });

  it('чужой менеджер не видит и не меняет наше меню', async () => {
    expect((await http().get('/admin/menu').set(as('other')).expect(200)).body.dishes[samsa]).toBeUndefined();
    await http().patch(`/admin/dishes/${samsa}`).set(as('other')).send({ priceTyiyn: 1 }).expect(404);
    await http().delete(`/admin/dishes/${samsa}`).set(as('other')).expect(404);
    await http().post(`/admin/dishes/${samsa}/photo`).set(as('other')).attach('file', Buffer.from('x'), 'x.jpg').expect(404);
    expect((await menu()).dishes[samsa]!.priceTyiyn).toBe(9500);
  });
});

describe('сотрудники', () => {
  it('добавление, вход, смена PIN, защита от самоблокировки', async () => {
    const body = { name: 'Новый официант', phone: '0555 200 004', role: 'waiter', station: 'BAR', isActive: true, pin: '4321' };
    const { id } = (await http().post('/admin/staff').set(as('manager')).send(body).expect(201)).body;
    expect((await http().post('/admin/staff').set(as('manager')).send(body).expect(409)).body.code).toBe('PHONE_TAKEN');
    expect((await http().post('/admin/staff').set(as('manager')).send({ ...body, phone: '12345' }).expect(400)).body.code).toBe('INVALID_PHONE');

    const list = (await http().get('/admin/staff').set(as('manager')).expect(200)).body as AdminStaffDto[];
    expect(list.find((s) => s.id === id)).toMatchObject({ phone: PH.newbie, station: null }); // цех только у кухни

    const t = await login(PH.newbie, '4321');
    await http().get('/staff/me').set({ Authorization: `Bearer ${t}` }).expect(200);
    await http().put(`/admin/staff/${id}`).set(as('manager')).send({ ...body, pin: '9876' }).expect(200);
    await http().get('/staff/me').set({ Authorization: `Bearer ${t}` }).expect(401);
    expect(await login(PH.newbie, '9876')).toBeTruthy();

    const me = list.find((s) => s.phone === PH.manager)!;
    const self = { name: me.name, phone: me.phone, role: 'manager', station: null, isActive: false };
    expect((await http().put(`/admin/staff/${me.id}`).set(as('manager')).send(self).expect(409)).body.code).toBe('SELF_LOCKOUT');
    await http().put(`/admin/staff/${me.id}`).set(as('manager')).send({ ...self, isActive: true, role: 'waiter' }).expect(409);
    await http().put(`/admin/staff/${id}`).set(as('other')).send(body).expect(404);
  });
});

describe('настройки', () => {
  const base = async () => {
    const s = (await http().get('/admin/settings').set(as('manager')).expect(200)).body as SettingsDto;
    const { slug: _s, logoUrl: _l, ...input } = s;
    return input;
  };

  it('сохраняет настройки и проверяет 2GIS-ссылку и цвет', async () => {
    const input = await base();
    const next = { ...input, serviceFeeBp: 1500, accentColor: '#0F766E', twoGisUrl: 'https://2gis.kg/bishkek/firm/123', orderFlow: 'WAITER_CONFIRM' };
    const saved = (await http().put('/admin/settings').set(as('manager')).send(next).expect(200)).body as SettingsDto;
    expect(saved).toMatchObject({ serviceFeeBp: 1500, accentColor: '#0F766E', orderFlow: 'WAITER_CONFIRM' });
    await http().put('/admin/settings').set(as('manager')).send({ ...next, twoGisUrl: 'https://evil.example/2gis.kg' }).expect(400);
    await http().put('/admin/settings').set(as('manager')).send({ ...next, accentColor: 'red' }).expect(400);
    await http().put('/admin/settings').set(as('manager')).send({ ...next, openingHours: { mon: [['10:00', '25:00']] } }).expect(400);
    await http().put('/admin/settings').set(as('manager')).send({ ...input }).expect(200);
  });

  it('вне часов работы гость видит меню, но заказать не может', async () => {
    const input = await base();
    const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bishkek', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    const hh = (x: number) => `${String(x % 24).padStart(2, '0')}:00`;
    const closedNow = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [[hh(h + 2), hh(h + 3)]]]));
    await http().put('/admin/settings').set(as('manager')).send({ ...input, openingHours: closedNow }).expect(200);
    try {
      expect((await guestMenu(tableUrl)).restaurant.isOpen).toBe(false);
      const res = await http()
        .post(`/public/orders/${guestPath(tableUrl)}`)
        .send({ deviceId: randomUUID(), clientRequestId: randomUUID(), items: [{ dishId: samsa, selection: {}, quantity: 1 }] })
        .expect(403);
      expect(res.body.code).toBe('RESTAURANT_CLOSED');
    } finally {
      await http().put('/admin/settings').set(as('manager')).send({ ...input, openingHours: {} }).expect(200);
    }
    expect((await guestMenu(tableUrl)).restaurant.isOpen).toBe(true);
  });

  it('логотип сохраняется как WebP', async () => {
    const png = await sharp({ create: { width: 800, height: 400, channels: 4, background: '#ffffff' } }).png().toBuffer();
    const { logoUrl } = (await http().post('/admin/settings/logo').set(as('manager')).attach('file', png, 'logo.png').expect(201)).body;
    expect(logoUrl).toMatch(/\.webp$/);
    expect((await guestMenu(tableUrl)).restaurant.logoUrl).toBe(logoUrl);
  });
});

describe('отчёты', () => {
  it('выручка, чеки, средний чек, наличные/карта, по дням (Бишкек) и топ блюд', async () => {
    const r = await prisma.restaurant.findUniqueOrThrow({ where: { slug: SLUG } });
    const list = await tables();
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: samsa } });
    // Три закрытых счёта: два «вчера» поздно вечером по Бишкеку (в UTC это ещё вчера/уже сегодня), один позавчера
    const mk = async (tableIdx: number, qty: number, closedAt: Date, paidWith: 'CASH' | 'CARD', cancelledQty = 0) => {
      const subtotal = qty * dish.priceTyiyn;
      const bill = await prisma.tableBill.create({
        data: {
          restaurantId: r.id,
          tableId: list[tableIdx]!.id,
          status: 'CLOSED',
          paidWith,
          closedAt,
          subtotalTyiyn: subtotal,
          serviceFeeTyiyn: subtotal / 10,
          totalTyiyn: subtotal * 1.1,
        },
      });
      await prisma.order.create({
        data: {
          restaurantId: r.id,
          billId: bill.id,
          tableId: bill.tableId,
          number: 1,
          status: 'SERVED',
          deviceId: 'd',
          totalTyiyn: subtotal,
          items: {
            create: [
              { restaurantId: r.id, dishId: dish.id, nameSnapshot: dish.name!, unitPriceTyiyn: dish.priceTyiyn, quantity: qty, station: 'KITCHEN', status: 'SERVED' },
              ...(cancelledQty
                ? [{ restaurantId: r.id, dishId: dish.id, nameSnapshot: dish.name!, unitPriceTyiyn: dish.priceTyiyn, quantity: cancelledQty, station: 'KITCHEN' as const, status: 'CANCELLED' as const }]
                : []),
            ],
          },
        },
      });
    };
    await mk(0, 2, new Date('2026-03-10T17:30:00Z'), 'CASH', 5); // 23:30 10 марта по Бишкеку
    await mk(1, 1, new Date('2026-03-10T18:30:00Z'), 'CARD'); // 00:30 11 марта по Бишкеку
    await mk(2, 4, new Date('2026-03-09T06:00:00Z'), 'CARD');

    const rep = (await http().get('/admin/reports?from=2026-03-09&to=2026-03-11').set(as('manager')).expect(200)).body as ReportDto;
    // 9500 тыйын × (2+1+4) = 66 500 сом... → ×1,1
    expect(rep).toMatchObject({
      revenueTyiyn: 73150,
      billsCount: 3,
      avgCheckTyiyn: 24383,
      ordersCount: 3,
      cashTyiyn: 20900,
      cardTyiyn: 52250,
    });
    expect(rep.byDay).toEqual([
      { date: '2026-03-09', revenueTyiyn: 41800, billsCount: 1 },
      { date: '2026-03-10', revenueTyiyn: 20900, billsCount: 1 },
      { date: '2026-03-11', revenueTyiyn: 10450, billsCount: 1 },
    ]);
    expect(rep.topDishes).toEqual([{ name: { ru: 'Самса', ky: 'Самса' }, quantity: 7, revenueTyiyn: 66500 }]);

    await http().get('/admin/reports?from=2026-03-11&to=2026-03-09').set(as('manager')).expect(400);
    await http().get('/admin/reports?from=2024-01-01&to=2026-03-09').set(as('manager')).expect(400);
    expect(((await http().get('/admin/reports?from=2026-03-09&to=2026-03-11').set(as('other')).expect(200)).body as ReportDto).billsCount).toBe(0);
  });
});
