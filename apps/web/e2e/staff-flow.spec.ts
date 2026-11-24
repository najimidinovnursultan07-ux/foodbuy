import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@qrmenu/db';
import { createTableToken } from '@qrmenu/shared/server';

// Смена в демо-ресторане на столе 6: гость → кухня и бар → официант → закрытие счёта.
const prisma = new PrismaClient();
const secret = process.env.QR_SIGNING_SECRET ?? 'dev-qr-secret-change-me';
const API = 'http://localhost:4000';
let token: string;
let dishes: { lagman: string; tea: string; portion: string; std: string; teaType: string; black: string };

test.beforeAll(async () => {
  const table = await prisma.table.findFirstOrThrow({ where: { restaurant: { slug: 'ala-too-demo' }, label: '6' } });
  await prisma.tableBill.deleteMany({ where: { tableId: table.id } });
  await prisma.waiterCall.deleteMany({ where: { tableId: table.id } });
  token = createTableToken(table.id, table.tokenVersion, secret);
  const find = (ru: string) =>
    prisma.dish.findFirstOrThrow({
      where: { restaurant: { slug: 'ala-too-demo' }, name: { path: ['ru'], equals: ru } },
      include: { modifierGroups: { orderBy: { sortOrder: 'asc' }, include: { modifiers: { orderBy: { sortOrder: 'asc' } } } } },
    });
  const lagman = await find('Лагман');
  const tea = await find('Чай');
  dishes = {
    lagman: lagman.id,
    tea: tea.id,
    portion: lagman.modifierGroups[0]!.id,
    std: lagman.modifierGroups[0]!.modifiers[0]!.id,
    teaType: tea.modifierGroups[0]!.id,
    black: tea.modifierGroups[0]!.modifiers[0]!.id,
  };
});
test.afterAll(() => prisma.$disconnect());

async function staffPage(browser: Browser, phone: string, pin: string, viewport = { width: 1280, height: 800 }) {
  const page = await (await browser.newContext({ viewport })).newPage();
  await page.goto('/staff');
  await page.getByLabel('Телефон').fill(phone);
  await page.getByLabel('PIN-код').fill(pin);
  await page.getByRole('button', { name: 'Войти' }).click();
  return page;
}

const ticket = (page: Page, col: 'NEW' | 'IN_PROGRESS' | 'READY') =>
  page.getByTestId(`col-${col}`).getByTestId('ticket').filter({ hasText: 'Стол 6' });

test('смена: кухня и бар готовят, официант забирает и закрывает счёт, гость видит статусы вживую', async ({ browser, request }) => {
  // Гость сделал заказ и смотрит на счёт
  const order = await request.post(`${API}/public/orders/ala-too-demo/${token}`, {
    data: {
      deviceId: randomUUID(),
      clientRequestId: randomUUID(),
      items: [
        { dishId: dishes.lagman, selection: { [dishes.portion]: [dishes.std] }, quantity: 1, comment: 'без лука' },
        { dishId: dishes.tea, selection: { [dishes.teaType]: [dishes.black] }, quantity: 1 },
      ],
    },
  });
  expect(order.status()).toBe(201);
  const guest = await (await browser.newContext({ ...test.info().project.use })).newPage();
  await guest.goto(`/m/ala-too-demo/${token}?view=bill`);
  await expect(guest.getByTestId('order')).toContainText('Принят');

  // Кухня (планшет): видит только лагман, с комментарием
  const kitchen = await staffPage(browser, '+996700000003', '2222');
  await expect(kitchen).toHaveURL(/\/staff\/kitchen/);
  await expect(kitchen.getByRole('tab', { name: 'Кухня' })).toHaveAttribute('aria-selected', 'true');
  await expect(ticket(kitchen, 'NEW')).toContainText('Лагман');
  await expect(ticket(kitchen, 'NEW')).toContainText('«без лука»');
  await expect(ticket(kitchen, 'NEW')).not.toContainText('Чай');
  await ticket(kitchen, 'NEW').getByRole('button', { name: 'Начать' }).click();
  await expect(ticket(kitchen, 'IN_PROGRESS')).toBeVisible();
  await expect(guest.getByTestId('order')).toContainText('Готовится');

  // Бар отдаёт чай
  const bar = await staffPage(browser, '+996700000004', '3333');
  await expect(ticket(bar, 'NEW')).toContainText('Чай');
  await ticket(bar, 'NEW').getByRole('button', { name: 'Готово' }).click();
  await expect(ticket(bar, 'READY')).toBeVisible();

  // Официант (телефон) видит «готово — забрать»: пока только чай; лагман появляется вживую
  const waiter = await staffPage(browser, '+996700000002', '1111', { width: 393, height: 851 });
  await expect(waiter).toHaveURL(/\/staff\/waiter/);
  const ready = waiter.getByTestId('ready').getByRole('article').filter({ hasText: 'Стол 6' });
  await expect(ready).toContainText('Чай');
  await expect(ready).not.toContainText('Лагман');
  await ticket(kitchen, 'IN_PROGRESS').getByRole('button', { name: 'Готово' }).click();
  await expect(ready).toContainText('Лагман');
  await expect(guest.getByTestId('order')).toContainText('Готово');

  await ready.getByRole('button', { name: 'Отдано' }).click();
  await expect(ready).toHaveCount(0);
  await expect(guest.getByTestId('order')).toContainText('Подано');
  await expect(ticket(kitchen, 'READY')).toHaveCount(0); // ушло с экрана кухни

  // Гость просит счёт картой — у официанта появляется вызов
  await guest.getByRole('button', { name: 'Карта' }).click();
  const call = waiter.getByTestId('calls').getByRole('article').filter({ hasText: 'Стол 6' });
  await expect(call).toContainText('Просит счёт · Карта');
  await call.getByRole('button', { name: 'Иду' }).click();
  await expect(call).toContainText('Вы идёте');

  // Закрытие счёта: гость заплатил картой (деньги идут мимо платформы)
  const bill = waiter.getByTestId('bill').filter({ hasText: 'Стол 6' });
  await expect(bill).toContainText(/462\sсом/); // (320 + 100) + 10%
  await expect(bill).toContainText('Хочет платить: Карта');
  await bill.getByRole('button', { name: 'Закрыть счёт' }).click();
  await bill.getByRole('button', { name: 'Карта' }).click();
  await expect(bill).toHaveCount(0);
  await expect(call).toHaveCount(0);
  await expect(guest.getByText('Заказов пока нет')).toBeVisible();

  const closed = await prisma.tableBill.findFirstOrThrow({ where: { table: { label: '6', restaurant: { slug: 'ala-too-demo' } } } });
  expect(closed).toMatchObject({ status: 'CLOSED', paidWith: 'CARD', totalTyiyn: 46200 });
});

test('вход: неверный PIN — понятная ошибка; без входа — на экран входа', async ({ page }) => {
  await page.goto('/staff/waiter');
  await expect(page).toHaveURL(/\/staff$/);
  await page.getByLabel('Телефон').fill('+996700000002');
  await page.getByLabel('PIN-код').fill('9999');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page.getByText('Неверный телефон или PIN')).toBeVisible();
  await page.getByRole('button', { name: 'KY' }).click();
  await expect(page.getByRole('heading', { name: 'Кызматкерлер үчүн кирүү' })).toBeVisible();
});
