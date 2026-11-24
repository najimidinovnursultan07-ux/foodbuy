import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@qrmenu/db';
import { createTableToken } from '@qrmenu/shared/server';

const prisma = new PrismaClient();
const secret = process.env.QR_SIGNING_SECRET ?? 'dev-qr-secret-change-me';
const API = 'http://localhost:4000';
const NEW_SLUG = 'e2e-cafe';

test.beforeAll(async () => {
  await prisma.restaurant.deleteMany({ where: { slug: NEW_SLUG } });
});
test.afterAll(async () => {
  await prisma.restaurant.deleteMany({ where: { slug: NEW_SLUG } });
  await prisma.$disconnect();
});

async function tableToken(label: string) {
  const t = await prisma.table.findFirstOrThrow({ where: { restaurant: { slug: 'ala-too-demo' }, label } });
  await prisma.tableBill.deleteMany({ where: { tableId: t.id } });
  await prisma.waiterCall.deleteMany({ where: { tableId: t.id } });
  return createTableToken(t.id, t.tokenVersion, secret);
}

async function orderAndClose(request: APIRequestContext, browser: Browser, label: string, rating: number, comment?: string) {
  const token = await tableToken(label);
  const samsa = await prisma.dish.findFirstOrThrow({ where: { restaurant: { slug: 'ala-too-demo' }, name: { path: ['ru'], equals: 'Самса с говядиной' } } });
  const order = await request.post(`${API}/public/orders/ala-too-demo/${token}`, {
    data: { deviceId: randomUUID(), clientRequestId: randomUUID(), items: [{ dishId: samsa.id, selection: {}, quantity: 2 }] },
  });
  expect(order.status()).toBe(201);

  const guest = await (await browser.newContext({ ...test.info().project.use })).newPage();
  await guest.goto(`/m/ala-too-demo/${token}?view=bill`);
  await expect(guest.getByTestId('order')).toHaveCount(1);

  // Официант закрывает счёт — у гостя сам открывается запрос отзыва
  const login = await request.post(`${API}/staff/auth/login`, { data: { phone: '+996700000002', pin: '1111' } });
  const auth = { authorization: `Bearer ${(await login.json()).token}` };
  const feed = await (await request.get(`${API}/staff/waiter/feed`, { headers: auth })).json();
  const bill = feed.bills.find((b: { tableLabel: string }) => b.tableLabel === label);
  expect((await request.post(`${API}/staff/bills/${bill.id}/close`, { headers: auth, data: { paidWith: 'CASH' } })).status()).toBe(200);

  const sheet = guest.getByTestId('review');
  await expect(sheet.getByRole('heading', { name: 'Спасибо, что были у нас!' })).toBeVisible();
  await sheet.getByRole('radio', { name: `${rating} из 5` }).click();
  if (comment) await sheet.getByRole('textbox').fill(comment);
  await sheet.getByRole('button', { name: 'Отправить' }).click();
  return { guest, sheet, billId: bill.id as string, token };
}

test('плохой отзыв уходит только владельцу, хороший — приглашение в 2GIS; повторно не спрашиваем', async ({ request, browser }) => {
  const bad = await orderAndClose(request, browser, '7', 2, 'Долго несли');
  await expect(bad.sheet.getByRole('status')).toHaveText('Спасибо за честный отзыв. Мы передали его владельцу и обязательно разберёмся.');
  await expect(bad.sheet.getByRole('link', { name: 'Оставить отзыв в 2GIS' })).toHaveCount(0);
  expect(await prisma.review.findUniqueOrThrow({ where: { billId: bad.billId } })).toMatchObject({ rating: 2, comment: 'Долго несли', sentTo2gis: false });
  await bad.sheet.getByRole('button', { name: 'Закрыть' }).click();
  await bad.guest.reload();
  await expect(bad.guest.getByText('Заказов пока нет')).toBeVisible();
  await expect(bad.guest.getByTestId('review')).toHaveCount(0);

  const good = await orderAndClose(request, browser, '8', 5);
  await expect(good.sheet.getByRole('link', { name: 'Оставить отзыв в 2GIS' })).toHaveAttribute('href', 'https://2gis.kg/bishkek');
  expect((await prisma.review.findUniqueOrThrow({ where: { billId: good.billId } })).sentTo2gis).toBe(true);
});

test('супер-админ: новый ресторан, менеджер входит в панель; «только меню» и ручная подписка', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto('/platform');
  await page.getByLabel('Телефон').fill('+996700000099');
  await page.getByLabel('PIN-код').fill('999999');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/platform\/restaurants/);
  await expect(page.getByTestId('restaurant-row').filter({ hasText: 'ala-too-demo' })).toBeVisible();

  await page.getByRole('button', { name: '+ Добавить ресторан' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название').fill('E2E кафе');
  await dialog.getByLabel('Адрес (латиница)').fill(NEW_SLUG);
  await dialog.getByLabel('Имя менеджера').fill('Жанара');
  await dialog.getByLabel('Телефон менеджера').fill('0555 600 001');
  await dialog.getByLabel('PIN менеджера (4–6 цифр)').fill('1357');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  const row = page.getByTestId('restaurant-row').filter({ hasText: NEW_SLUG });
  await expect(row).toContainText('Работает');
  await expect(row).toContainText('Пробный');

  // Менеджер нового ресторана сразу попадает в свою панель
  const mgr = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await mgr.goto('/staff');
  await mgr.getByLabel('Телефон').fill('+996555600001');
  await mgr.getByLabel('PIN-код').fill('1357');
  await mgr.getByRole('button', { name: 'Войти' }).click();
  await expect(mgr).toHaveURL(/\/admin\/menu/);
  await expect(mgr.getByText('E2E кафе')).toBeVisible();

  // Перевод в «только меню» и ручная оплата
  await row.getByRole('button', { name: 'Изменить' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Только меню').check();
  await dialog.getByLabel('Подписка (ставится вручную)', { exact: true }).selectOption('ACTIVE');
  await dialog.getByLabel('Оплачено до').fill('2099-12-31');
  await dialog.getByLabel('Заметка (например, как оплатили)').fill('Наличными в офисе');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();
  await expect(row).toContainText('Только меню');
  await expect(row).toContainText('Оплачен · до 2099-12-31');
  expect((await prisma.restaurant.findUniqueOrThrow({ where: { slug: NEW_SLUG } })).status).toBe('MENU_ONLY');
});
